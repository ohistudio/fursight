#ifndef FURSIGHT_HANDS_INCLUDED
#define FURSIGHT_HANDS_INCLUDED
// Meta's Depth API soft occlusion, as in Meta's Unity-DepthAPI sample (EnvironmentOcclusionURP.hlsl): wherever
// something real is in front of the UI, the UI fades out there, so your hands and arms go over it. Needs, in the pass:
//     #pragma multi_compile _ HARD_OCCLUSION SOFT_OCCLUSION
// and the frag to run UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX first, so each eye reads its own depth.
#include "Packages/com.meta.xr.sdk.core/Shaders/EnvironmentDepth/URP/EnvironmentOcclusionURP.hlsl"

// 1 = draw, 0 = something real is in front
float FSHandOcclusion(float3 positionWS)
{
    return META_DEPTH_GET_OCCLUSION_VALUE_WORLDPOS(positionWS, 0.0);
}
#endif
