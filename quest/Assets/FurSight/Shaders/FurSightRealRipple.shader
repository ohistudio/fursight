// The real thing a card is about, pinched: a disc over it, facing you, redraws what the headset camera sees
// there (each pixel's world point projected into the passthrough camera's picture with its lens), magnified in
// the middle as if pulled up toward you, then let go with a little spring. Fades out at its edge into the
// passthrough. Hidden behind your hands like the rest of the UI.
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
                // pulled up: quick to rise (the first fifth), a moment held, then let go with a damped spring
                float up = _T < 0.2 ? smoothstep(0.0, 0.2, _T) : _T < 0.35 ? 1.0 : exp(-(_T - 0.35) * 6.0) * cos((_T - 0.35) * 18.0);
                float bulge = 0.22 * up * (1.0 - r * r);
                float3 centre = TransformObjectToWorld(float3(0, 0, 0));
                float2 uv = Project(i.world), uvC = Project(centre);
                float2 bent = uvC + (uv - uvC) * (1.0 - bulge);   // magnified in the middle
                half3 col = SAMPLE_TEXTURE2D(_CamTex, sampler_CamTex, saturate(bent)).rgb * (1.0 + 0.12 * max(up, 0.0) * (1.0 - r));
                float life = 1.0 - smoothstep(0.85, 1.0, _T);
                float edge = 1.0 - smoothstep(0.7, 1.0, r);
                float inFrame = all(bent > 0.01) && all(bent < 0.99) ? 1.0 : 0.0;
                half4 o = half4(col, edge * life * inFrame * _HasCam);
                o *= FSHandOcclusion(i.world);
                return o;
            }
            ENDHLSL
        }
    }
}
