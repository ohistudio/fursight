#ifndef FURSIGHT_HANDS_INCLUDED
#define FURSIGHT_HANDS_INCLUDED
// Meta's Depth API soft occlusion (as in Meta's Unity-DepthAPI sample), but only for your hands and arms: Meta's
// occlusion value is used only where the real thing in front is within arm's reach of your eyes (under about
// 70 cm), so the room, furniture and the things a label sits on never hide the UI. Needs, in the pass:
//     #pragma multi_compile _ HARD_OCCLUSION SOFT_OCCLUSION
// and the frag to run UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX first, so each eye reads its own depth.
// Full-precision floats only: half locals here fail to compile on Quest (Vulkan), and the UI silently falls back.
#include "Packages/com.meta.xr.sdk.core/Shaders/EnvironmentDepth/URP/EnvironmentOcclusionURP.hlsl"

// 1 = draw, 0 = your hand or arm is in front
float FSHandOcclusion(float3 positionWS)
{
#if defined(HARD_OCCLUSION) || defined(SOFT_OCCLUSION)
    float meta = META_DEPTH_GET_OCCLUSION_VALUE_WORLDPOS(positionWS, 0.0);
    float4 ds = mul(_EnvironmentDepthReprojectionMatrices[unity_StereoEyeIndex], float4(positionWS, 1.0));
    float2 uv = (ds.xy / ds.w + 1.0) * 0.5;
    float real = SampleEnvironmentDepthLinear(uv);
    float reach = 1.0 - smoothstep(0.65, 0.8, real);   // 1 within arm's reach, 0 beyond
    return lerp(1.0, meta, reach);
#else
    return 1.0;
#endif
}
#endif
