using System.IO;
using UnityEditor.Android;

// Meta writes the Quest manifest from OVRProjectConfig, which has no switch for the passthrough cameras.
// Added after Meta's own patching: the headset-camera permission PetCamera asks for at runtime.
public class FurSightManifest : IPostGenerateGradleAndroidProject
{
    public int callbackOrder => 10000;   // after OVRGradleGeneration

    public void OnPostGenerateGradleAndroidProject(string path)
    {
        string manifest = Path.Combine(path, "src", "main", "AndroidManifest.xml");
        if (!File.Exists(manifest)) return;
        string xml = File.ReadAllText(manifest);
        const string permission = "horizonos.permission.HEADSET_CAMERA";
        if (xml.Contains(permission)) return;
        int at = xml.IndexOf("<application", System.StringComparison.Ordinal);
        if (at < 0) return;
        File.WriteAllText(manifest, xml.Insert(at, "<uses-permission android:name=\"" + permission + "\" />\n  "));
        UnityEngine.Debug.Log("[FurSight] manifest: added " + permission);
    }
}
