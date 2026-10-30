#ifndef FURSIGHT_HANDS_INCLUDED
#define FURSIGHT_HANDS_INCLUDED
// Only your hands go over FurSight's UI: Meta's environment depth says something real is in front of this pixel,
// and this checks that the real thing is a hand (near one of the tracked hand points CardInput sends each frame),
// so the sofa or a wall never cuts into a card. Needs, in the pass:
//     #pragma multi_compile _ HARD_OCCLUSION SOFT_OCCLUSION
// and the frag to run UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX first, so each eye reads its own depth.
#include "Packages/com.meta.xr.sdk.core/Shaders/EnvironmentDepth/URP/EnvironmentOcclusionURP.hlsl"

float4 _FSHands[4];   // xyz a point on a hand, w its radius (0 = not tracked)

// 1 = draw, 0 = a hand is in front. A tracked hand point lies along this pixel's line of sight, nearer than the
// UI: then the environment depth gives the hand's real outline (so it's your fingers, not a round blob).
half FSHandOcclusion(float3 positionWS)
{
#if defined(HARD_OCCLUSION) || defined(SOFT_OCCLUSION)
    float3 eye = GetCameraPositionWS();
    float3 ray = positionWS - eye;
    float far = length(ray);
    float3 dir = ray / max(far, 1e-4);
    half hand = 0.0;
    for (int i = 0; i < 4; i++)
    {
        if (_FSHands[i].w <= 0.0) continue;
        float3 h = _FSHands[i].xyz - eye;
        float along = dot(h, dir);
        if (along <= 0.05 || along >= far - 0.005) continue;   // behind you, or behind the UI
        float off = length(h - dir * along);
        hand = max(hand, 1.0 - smoothstep(_FSHands[i].w * 0.8, _FSHands[i].w * 1.2, off));
    }
    if (hand <= 0.0) return 1.0;
    half v = META_DEPTH_GET_OCCLUSION_VALUE_WORLDPOS(positionWS, 0.0);
    return lerp(1.0, v, hand);
#else
    return 1.0;
#endif
}
#endif
