// BSD-3-Clause. SDK-side discovery adapter for the real Aurora camera stream.
// This registers a GstDevice for emulatorcambin; it generates no test images.
#include <gst/gst.h>
#define PACKAGE "jitsi-aurora-emulator-camera"

typedef struct { GstDevice parent; } JitsiEmulatorDevice;
typedef struct { GstDeviceClass parent; } JitsiEmulatorDeviceClass;
G_DEFINE_TYPE(JitsiEmulatorDevice, jitsi_emulator_device, GST_TYPE_DEVICE)

static GstElement *create_camera(GstDevice *, const gchar *name)
{
    GstElement *bin = gst_bin_new(name);
    GstElement *source = gst_element_factory_make("emulatorcambin", "emulated-camera");
    GstElement *convert = gst_element_factory_make("videoconvert", "convert");
    GstElement *scale = gst_element_factory_make("videoscale", "size");
    GstElement *rate = gst_element_factory_make("videorate", "frame-rate");
    GstElement *filter = gst_element_factory_make("capsfilter", "format");
    if (!bin || !source || !convert || !scale || !rate || !filter) {
        if (source) gst_object_unref(source);
        if (convert) gst_object_unref(convert);
        if (scale) gst_object_unref(scale);
        if (rate) gst_object_unref(rate);
        if (filter) gst_object_unref(filter);
        if (bin) gst_object_unref(bin);
        return nullptr;
    }
    GParamSpec *cameraProperty = g_object_class_find_property(G_OBJECT_GET_CLASS(source), "camera-device");
    if (cameraProperty && G_PARAM_SPEC_VALUE_TYPE(cameraProperty) == G_TYPE_STRING)
        g_object_set(source, "camera-device", "0", nullptr);
    GstCaps *caps = gst_caps_from_string("video/x-raw,format=I420,width=640,height=480,framerate=30/1");
    g_object_set(filter, "caps", caps, nullptr);
    gst_caps_unref(caps);
    gst_bin_add_many(GST_BIN(bin), source, convert, scale, rate, filter, nullptr);
    if (!gst_element_link_pads(source, "vfsrc", convert, "sink") || !gst_element_link_many(convert, scale, rate, filter, nullptr)) {
        gst_object_unref(bin);
        return nullptr;
    }
    GstPad *output = gst_element_get_static_pad(filter, "src");
    gst_element_add_pad(bin, gst_ghost_pad_new("src", output));
    gst_object_unref(output);
    return bin;
}

static void jitsi_emulator_device_class_init(JitsiEmulatorDeviceClass *klass)
{
    GST_DEVICE_CLASS(klass)->create_element = create_camera;
}
static void jitsi_emulator_device_init(JitsiEmulatorDevice *) {}

typedef struct { GstDeviceProvider parent; } JitsiEmulatorProvider;
typedef struct { GstDeviceProviderClass parent; } JitsiEmulatorProviderClass;
G_DEFINE_TYPE(JitsiEmulatorProvider, jitsi_emulator_provider, GST_TYPE_DEVICE_PROVIDER)

static GList *probe(GstDeviceProvider *)
{
    GstElementFactory *factory = gst_element_factory_find("emulatorcambin");
    if (!factory) return nullptr;
    gst_object_unref(factory);
    GstCaps *caps = gst_caps_from_string("video/x-raw,format=I420,width=640,height=480,framerate=30/1");
    GstStructure *properties = gst_structure_new("properties",
        "device.path", G_TYPE_STRING, "aurora-sdk-camera-0",
        "facing", G_TYPE_INT, 2,
        "mount-angle", G_TYPE_INT, 0, nullptr);
    GstDevice *device = GST_DEVICE(g_object_new(jitsi_emulator_device_get_type(),
        "display-name", "Aurora SDK host camera",
        "device-class", "Video/Source", "caps", caps,
        "properties", properties, nullptr));
    gst_caps_unref(caps);
    gst_structure_free(properties);
    return g_list_append(nullptr, device);
}

static void jitsi_emulator_provider_class_init(JitsiEmulatorProviderClass *klass)
{
    auto providerClass = GST_DEVICE_PROVIDER_CLASS(klass);
    providerClass->probe = probe;
    gst_device_provider_class_set_static_metadata(providerClass,
        "Aurora SDK real camera provider", "Video/Source",
        "Exposes the SDK emulatorcambin stream as a discoverable camera", "Jitsi Aurora project");
}
static void jitsi_emulator_provider_init(JitsiEmulatorProvider *) {}
static gboolean plugin_init(GstPlugin *plugin)
{
    return gst_device_provider_register(plugin, "aurorajitsiemulatorprovider", GST_RANK_PRIMARY,
        jitsi_emulator_provider_get_type());
}
GST_PLUGIN_DEFINE(GST_VERSION_MAJOR, GST_VERSION_MINOR, emulatorprovider,
    "Aurora SDK real camera discovery adapter", plugin_init, "0.1", "BSD", "Jitsi Aurora", "local")
