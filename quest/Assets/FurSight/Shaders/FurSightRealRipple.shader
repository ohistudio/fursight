// The real room rippling where a card lands. A disc lying on the real surface redraws what the headset camera
// sees there (each pixel's world point projected into the passthrough camera's picture with its lens), pushed in
// and out by rings running outwards, with a little of the card's colour on each crest. It fades out at the edge
// and as the ripple dies, so it hands back to the passthrough. Hidden behind real things like the rest of the UI.
Shader "FurSight/Real Ripple"
{
    Properties
    {
        _CamTex ("Camera", 2D) = "black" {}
        _Tint ("Crest colour", Color) = (0.6, 0.42, 0.94, 1)
        _T ("Time (0 landed .. 1 gone)", Range(0, 1)) = 0
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "RenderType" = "Transparent" "Queue" = "Transparent" }
        Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha
        ZWrite Off
        Cull Off

        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ HARD_OCCLUSION SOFT_OCCLUSION
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "FurSightHands.hlsl"

            struct Attributes { float4 vertex : POSITION; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 world : TEXCOORD2;
                UNITY_VERTEX_INPUT_INSTANCE_ID
                UNITY_VERTEX_OUTPUT_STEREO
            };

            TEXTURE2D(_CamTex); SAMPLER(sampler_CamTex);
            float4x4 _WorldToCam;   // world -> the passthrough camera, at its pose this frame
            float4 _Lens;           // focal length (x, y), principal point (x, y), in sensor pixels
            float4 _Crop;           // the part of the sensor in the texture: offset (x, y), size (x, y), in sensor pixels
            float4 _Tint;
            float _T, _HasCam;

            Varyings vert(Attributes input)
            {
                Varyings o;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, o);
                o.positionCS = TransformObjectToHClip(input.vertex.xyz);
                o.uv = input.uv;
                o.world = TransformObjectToWorld(input.vertex.xyz);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                return o;
            }

            // where a world point appears in the camera's picture (0-1)
            float2 Project(float3 world)
            {
                float3 c = mul(_WorldToCam, float4(world, 1.0)).xyz;
                float2 sensor = c.xy / max(c.z, 0.01) * _Lens.xy + _Lens.zw;
                return (sensor - _Crop.xy) / _Crop.zw;
            }

            half4 frag(Varyings i) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(i);
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(i);
                float2 d = (i.uv - 0.5) * 2.0;
                float r = length(d);
                if (r > 1.0) discard;
                float life = 1.0 - _T;
                // like a pinch: for the first fifth the surface draws in toward the middle, then it lets go and slow,
                // wide rings run outwards, strongest at their front, gone by the edge
                float pinch = smoothstep(0.0, 0.2, _T) * (1.0 - smoothstep(0.2, 0.32, _T));
                float t2 = saturate((_T - 0.2) / 0.8);
                float front = t2 * 1.1;
                float wave = sin((r - front) * 20.0) * exp(-abs(r - front) * 5.0) * (1.0 - t2) - pinch * (1.0 - r) * 0.9;
                // push the picture in and out along the radius: the real surface bending
                float3 centre = TransformObjectToWorld(float3(0, 0, 0));
                float2 uv = Project(i.world), uvC = Project(centre);
                float2 dir = normalize(uv - uvC + 1e-5);
                float2 bent = uv + dir * wave * 0.014;
                half3 room = SAMPLE_TEXTURE2D(_CamTex, sampler_CamTex, saturate(bent)).rgb;
                // a little light on the crests, in the card's colour
                half3 col = room + _Tint.rgb * saturate(wave) * 0.35;
                float edge = 1.0 - smoothstep(0.7, 1.0, r);
                float inFrame = all(bent > 0.01) && all(bent < 0.99) ? 1.0 : 0.0;
                half4 o = half4(col, edge * saturate(life * 1.5) * inFrame * _HasCam);
                o *= FSHandOcclusion(i.world);
                return o;
            }
            ENDHLSL
        }
    }
}
