#include <QCoreApplication>
#include <QLibrary>
#include <cstdio>

struct CameraInfoData {
    const char *id;
    const char *name;
    const char *provider;
    int facing;
    int mountAngle;
    const char *metadata;
};

// Probe the same stable C compatibility entry points used by Aurora Chromium.
// No capture is started and no camera identifiers or images are collected.
int main(int argc, char **argv)
{
    QCoreApplication app(argc, argv);
    QLibrary library("/usr/lib/libstreamcamera-compat.so.0");
    if (!library.load()) {
        std::fprintf(stderr, "STREAMCAMERA_LOAD_ERROR %s\n", qPrintable(library.errorString()));
        return 1;
    }
    using GetManager = void *(*)();
    using GetCount = int (*)(void *);
    auto getManager = reinterpret_cast<GetManager>(library.resolve("sc_camera_manager_get"));
    auto getCount = reinterpret_cast<GetCount>(library.resolve("sc_camera_manager_get_number_of_cameras"));
    if (!getManager || !getCount) { std::fprintf(stderr, "STREAMCAMERA_SYMBOL_ERROR\n"); return 1; }
    void *manager = getManager();
    if (!manager) { std::fprintf(stderr, "STREAMCAMERA_MANAGER_NULL\n"); return 1; }
    const int count = getCount(manager);
    std::fprintf(stderr, "STREAMCAMERA_COUNT %d\n", count);
    using GetInfo = void *(*)(void *, int);
    using GetData = bool (*)(void *, CameraInfoData *);
    using Unref = void (*)(void *);
    using GetCaps = void *(*)(void *, const char *);
    using Size = size_t (*)(void *);
    auto getInfo = reinterpret_cast<GetInfo>(library.resolve("sc_camera_manager_get_camera_info"));
    auto getData = reinterpret_cast<GetData>(library.resolve("sc_camera_info_get_data"));
    auto unrefInfo = reinterpret_cast<Unref>(library.resolve("sc_camera_info_unref"));
    auto getCaps = reinterpret_cast<GetCaps>(library.resolve("sc_camera_manager_query_capabilities"));
    auto capsSize = reinterpret_cast<Size>(library.resolve("sc_camera_capability_list_size"));
    auto unrefCaps = reinterpret_cast<Unref>(library.resolve("sc_camera_capability_list_unref"));
    if (!getInfo || !getData || !unrefInfo || !getCaps || !capsSize || !unrefCaps) return 1;
    for (int i = 0; i < count; ++i) {
        void *info = getInfo(manager, i);
        CameraInfoData data = {};
        if (info && getData(info, &data)) {
            void *caps = getCaps(manager, data.id);
            std::fprintf(stderr, "STREAMCAMERA_DEVICE provider=%s facing=%d capabilities=%zu\n",
                data.provider ? data.provider : "unknown", data.facing, caps ? capsSize(caps) : 0);
            if (caps) unrefCaps(caps);
        }
        if (info) unrefInfo(info);
    }
    return count ? 0 : 2;
}
