#include <gst/gst.h>
#include <gst/app/gstappsink.h>
#include <cstdio>

int main(int argc, char **argv)
{
    gst_init(&argc, &argv);
    GError *error = nullptr;
    auto pipeline = gst_parse_launch(
        "emulatorcambin name=camera camera.vfsrc ! videoconvert ! video/x-raw,format=I420 ! "
        "appsink name=sink sync=false max-buffers=1 drop=true", &error);
    if (!pipeline || error) {
        std::fprintf(stderr, "GST_CAMERA_BUILD_ERROR %s\n", error ? error->message : "unknown");
        if (error) g_error_free(error);
        return 1;
    }
    auto sink = gst_bin_get_by_name(GST_BIN(pipeline), "sink");
    auto state = gst_element_set_state(pipeline, GST_STATE_PLAYING);
    auto sample = gst_app_sink_try_pull_sample(GST_APP_SINK(sink), 12000 * GST_MSECOND);
    int result = 2;
    if (sample) {
        int width = 0, height = 0;
        auto structure = gst_caps_get_structure(gst_sample_get_caps(sample), 0);
        gst_structure_get_int(structure, "width", &width);
        gst_structure_get_int(structure, "height", &height);
        std::fprintf(stderr, "GST_CAMERA_FRAME %dx%d bytes=%zu\n", width, height,
            gst_buffer_get_size(gst_sample_get_buffer(sample)));
        gst_sample_unref(sample);
        result = 0;
    } else {
        auto bus = gst_element_get_bus(pipeline);
        auto message = gst_bus_pop_filtered(bus, GST_MESSAGE_ERROR);
        if (message) {
            gst_message_parse_error(message, &error, nullptr);
            std::fprintf(stderr, "GST_CAMERA_ERROR %s\n", error ? error->message : "unknown");
            if (error) g_error_free(error);
            gst_message_unref(message);
        } else std::fprintf(stderr, "GST_CAMERA_TIMEOUT state=%d\n", int(state));
        gst_object_unref(bus);
    }
    gst_element_set_state(pipeline, GST_STATE_NULL);
    gst_object_unref(sink);
    gst_object_unref(pipeline);
    return result;
}
