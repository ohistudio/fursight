#ifndef FURSIGHT_HANDS_INCLUDED
#define FURSIGHT_HANDS_INCLUDED
// Only your hands go over FurSight's UI: Meta's environment depth says something real is in front of this pixel,
// and this checks that the real thing is a hand (near one of the tracked hand points CardInput sends each frame),
// so the sofa or a wall never cuts into a card. Needs, in the pass:
//     #pragma multi_compile _ HARD_OCCLUSION SOFT_OCCLUSION
// and the frag to run UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX first, so each eye reads its own depth.
#include "Packages/com.meta.xr.sdk.core/Shaders/EnvironmentDepth/URP/EnvironmentOcclusionURP.hlsl"

float4 _FSHands[4];   // xyz a point on a hand, w its radius (0 = not tracked)

// 1 = draw, 0 = a hand is in front
half FSHandOcclusion(float3 positionWS)
{
#if defined(HARD_OCCLUSION) || defined(SOFT_OCCLUSION)
    half v = META_DEPTH_GET_OCCLUSION_VALUE_WORLDPOS(positionWS, 0.0);
    if (v > 0.999) return 1.0;
    // the real surface in front: the depth along this pixel's ray, scaled out from the eye
    float4 ds = mul(_EnvironmentDepthReprojectionMatrices[unity_StereoEyeIndex], float4(positionWS, 1.0));
    float2 uv = (ds.xy / ds.w + 1.0) * 0.5;
    float sceneLin = (1.0 / ((ds.z / ds.w) + _EnvironmentDepthZBufferParams.y)) * _EnvironmentDepthZBufferParams.x;
    float realLin = SampleEnvironmentDepthLinear(uv);
    float3 eye = GetCameraPositionWS();
    float3 real = eye + (positionWS - eye) * (realLin / max(sceneLin, 1e-4));
    half hand = 0.0;
    for (int i = 0; i < 4; i++)
        if (_FSHands[i].w > 0.0) hand = max(hand, 1.0 - smoothstep(_FSHands[i].w * 0.75, _FSHands[i].w, distance(real, _FSHands[i].xyz)));
    return lerp(1.0, v, hand);
#else
    return 1.0;
#endif
}
#endif
