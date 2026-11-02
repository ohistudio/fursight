#ifndef FURSIGHT_HANDS_INCLUDED
#define FURSIGHT_HANDS_INCLUDED
// Your hands go over FurSight's UI, all of it: Meta's environment depth says something real is in front of this
// pixel, and either it's a hand (along the line of sight to one of the tracked hand points CardInput sends each
// frame) or it's your arm's reach (under 70 cm from your eyes, where only your hands and arms are), so the room never
// cuts into a card or a label on a real thing, but your hands and arms always do, tracked or not. Needs, in the pass:
//     #pragma multi_compile _ HARD_OCCLUSION SOFT_OCCLUSION
// and the frag to run UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX first, so each eye reads its own depth.
#include "Packages/com.meta.xr.sdk.core/Shaders/EnvironmentDepth/URP/EnvironmentOcclusionURP.hlsl"

float4 _FSHands[8];   // xyz a point on a hand, w its radius (0 = not tracked)

// 1 = draw, 0 = a hand is in front
half FSHandOcclusion(float3 positionWS)
{
#if defined(HARD_OCCLUSION) || defined(SOFT_OCCLUSION)
    float3 eye = GetCameraPositionWS();
    float3 ray = positionWS - eye;
    float far = length(ray);
    float3 dir = ray / max(far, 1e-4);
    half hand = 0.0;
    for (int i = 0; i < 8; i++)
    {
        if (_FSHands[i].w <= 0.0) continue;
        float3 h = _FSHands[i].xyz - eye;
        float along = dot(h, dir);
        if (along <= 0.05 || along >= far - 0.005) continue;   // behind you, or behind the UI
        float off = length(h - dir * along);
        hand = max(hand, 1.0 - smoothstep(_FSHands[i].w * 0.8, _FSHands[i].w * 1.2, off));
    }

    // the real depth here, straight from the depth image, against the UI's
    const float4 ds = mul(_EnvironmentDepthReprojectionMatrices[unity_StereoEyeIndex], float4(positionWS, 1.0));
    const float2 uv = (ds.xy / ds.w + 1.0) * 0.5;
    float ui = (1.0 / ((ds.z / ds.w) + _EnvironmentDepthZBufferParams.y)) * _EnvironmentDepthZBufferParams.x;
    float real = SampleEnvironmentDepthLinear(uv);
    // something real within arm's length of your eyes, in front of the UI: a hand (or something you're holding)
    hand = max(hand, (1.0 - smoothstep(0.6, 0.72, real)) * step(real, ui - 0.04));
    if (hand <= 0.0) return 1.0;

    half own = smoothstep(ui - 0.05, ui - 0.01, real);              // 0 where it's clearly in front
    half meta = META_DEPTH_GET_OCCLUSION_VALUE_WORLDPOS(positionWS, 0.0);
    return lerp(1.0, min(own, meta), hand);
#else
    return 1.0;
#endif
}
#endif
