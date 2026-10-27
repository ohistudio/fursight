using UnityEngine;

namespace FurSight
{
    // Who every answer is about. One per scene (on the FurSight object) until profiles live on the server.
    public class PetProfile : MonoBehaviour
    {
        public string petName = "Xiaosi";
        public string species = "rabbit";
        public string breed = "Netherland Dwarf";
        [TextArea] public string notes = "Male (he/him). Indoor house rabbit.";

        static PetProfile _instance;
        public static PetProfile Current => _instance != null ? _instance : _instance = FindFirstObjectByType<PetProfile>();

        public object ForServer() => new { name = petName, species, breed, notes };
    }
}
