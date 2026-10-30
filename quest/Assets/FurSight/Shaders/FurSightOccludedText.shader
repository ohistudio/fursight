// FurSight's TextMeshPro text, hidden where your real hand is in front of it, like the cards it sits on
// (FurSightHands.hlsl). A plain signed-distance-field face in the vertex colour: no outline, glow or bevel, which
// the cards never use. Without depth (the editor) it's just the text.
Shader "FurSight/Occluded Text"
{
    Properties
    {
        _MainTex ("Font Atlas", 2D) = "white" {}
        _FaceColor ("Face Color", Color) = (1, 1, 1, 1)
        // what TextMeshPro reads from any font material (unused here, but it looks for them)
        _GradientScale ("Gradient Scale", Float) = 5
        _TextureWidth ("Texture Width", Float) = 512
        _TextureHeight ("Texture Height", Float) = 512
        _ScaleRatioA ("Scale RatioA", Float) = 1
        _ScaleRatioB ("Scale RatioB", Float) = 1
        _ScaleRatioC ("Scale RatioC", Float) = 1
        _WeightNormal ("Weight Normal", Float) = 0
        _WeightBold ("Weight Bold", Float) = 0.5
        _FaceDilate ("Face Dilate", Range(-1, 1)) = 0
        _OutlineWidth ("Outline Thickness", Range(0, 1)) = 0
        _OutlineSoftness ("Outline Softness", Range(0, 1)) = 0
        _UnderlayOffsetX ("Underlay Offset X", Range(-1, 1)) = 0
        _UnderlayOffsetY ("Underlay Offset Y", Range(-1, 1)) = 0
        _UnderlayDilate ("Underlay Dilate", Range(-1, 1)) = 0
        _UnderlaySoftness ("Underlay Softness", Range(0, 1)) = 0
        _ShaderFlags ("Flags", Float) = 0
        _ClipRect ("Clip Rect", Vector) = (-32767, -32767, 32767, 32767)
        _MaskSoftnessX ("Mask SoftnessX", Float) = 0
        _MaskSoftnessY ("Mask SoftnessY", Float) = 0
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "Queue" = "Transparent" "RenderType" = "Transparent" "IgnoreProjector" = "True" }
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

            struct Attributes { float4 vertex : POSITION; half4 color : COLOR; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                half4 color : COLOR;
                float2 uv : TEXCOORD0;
                float3 world : TEXCOORD1;
                UNITY_VERTEX_INPUT_INSTANCE_ID
                UNITY_VERTEX_OUTPUT_STEREO
            };

            TEXTURE2D(_MainTex); SAMPLER(sampler_MainTex);
            CBUFFER_START(UnityPerMaterial)
                half4 _FaceColor;
            CBUFFER_END

            Varyings vert(Attributes input)
            {
                Varyings o;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, o);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.positionCS = TransformObjectToHClip(input.vertex.xyz);
                o.world = TransformObjectToWorld(input.vertex.xyz);
                o.color = input.color * _FaceColor;
                o.uv = input.uv;
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(i);
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(i);
                // the distance field: 0.5 is the letter's edge; soften by how fast it changes on screen
                float d = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv).a;
                float w = max(fwidth(d) * 0.75, 1e-4);
                half4 c = i.color;
                c.a *= smoothstep(0.5 - w, 0.5 + w, d);
                c *= FSHandOcclusion(i.world);
                return c;
            }
            ENDHLSL
        }
    }
}
