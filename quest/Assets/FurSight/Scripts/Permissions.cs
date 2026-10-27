using System;
using UnityEngine;
using UnityEngine.Android;

namespace FurSight
{
    // Horizon OS runtime permissions: the passthrough camera, and the scene (live depth, room mesh).
    public static class Permissions
    {
        public const string HeadsetCamera = "horizonos.permission.HEADSET_CAMERA";
        public const string Scene = "com.oculus.permission.USE_SCENE";

        public static void Ask(string permission, Action<bool> done)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (Permission.HasUserAuthorizedPermission(permission)) { done(true); return; }
            var cb = new PermissionCallbacks();
            cb.PermissionGranted += _ => done(true);
            cb.PermissionDenied += _ => done(false);
            Permission.RequestUserPermission(permission, cb);
#else
            done(true);
#endif
        }
    }
}
