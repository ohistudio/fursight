// FurSight Jelly: the Bean's glossy toy-plastic look, lit in the shader itself so it looks the same in any
// room (passthrough scenes have little real light). A soft key light from the top left, shadows that tint
// towards a colour instead of grey, a soft gloss plus a crisp hotspot, and a rim of light around the edge.
// Single-pass stereo safe for Quest.
Shader "FurSight/Jelly"
{
    Properties
    {
        _BaseColor ("Lit colour", Color) = (1, 1, 1, 1)
        _ShadeColor ("Shadow colour", Color) = (0.72, 0.66, 0.89, 1)
        _RimColor ("Rim colour", Color) = (0.93, 0.89, 1, 1)
        _Gloss ("Gloss (sharpness)", Range(4, 256)) = 48
        _Spec ("Highlight strength", Range(0, 1.5)) = 0.7
        _Rim ("Rim strength", Range(0, 1.5)) = 0.55
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" }
        Pass
        {
            Name "Jelly"
            Tags { "LightMode" = "UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _BaseColor, _ShadeColor, _RimColor;
                half _Gloss, _Spec, _Rim;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings { float4 positionCS : SV_POSITION; float3 normalVS : TEXCOORD0; float3 viewVS : TEXCOORD1; UNITY_VERTEX_OUTPUT_STEREO };

            Varyings vert(Attributes v)
            {
                Varyings o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                float3 ws = TransformObjectToWorld(v.positionOS.xyz);
                o.positionCS = TransformWorldToHClip(ws);
                o.normalVS = TransformWorldToViewDir(TransformObjectToWorldNormal(v.normalOS), true);
                o.viewVS = -TransformWorldToView(ws);   // from the surface towards the eye, in view space
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(i);
                float3 n = normalize(i.normalVS), v = normalize(i.viewVS);
                // the key light rides with the viewer: up, left and in front, so the face is always lit
                float3 l = normalize(float3(-0.45, 0.75, 0.55));
                float wrap = dot(n, l) * 0.5 + 0.5;
                half3 col = lerp(_ShadeColor.rgb, _BaseColor.rgb, smoothstep(0.12, 0.92, wrap));
                // a touch of bounce from below and a little contact darkening underneath
                col *= lerp(0.9, 1.0, saturate(n.y * 0.5 + 0.6));
                // gloss: a soft sheen and a crisp hotspot
                float3 h = normalize(l + v);
                float nh = saturate(dot(n, h));
                float soft = pow(nh, _Gloss * 0.25) * 0.25, hot = smoothstep(0.55, 0.62, pow(nh, _Gloss));
                col += (soft + hot) * _Spec;
                // rim
                float f = pow(1.0 - saturate(dot(n, v)), 3.0);
                col = lerp(col, _RimColor.rgb, f * _Rim);
                return half4(col, 1);
            }
            ENDHLSL
        }
    }
}
