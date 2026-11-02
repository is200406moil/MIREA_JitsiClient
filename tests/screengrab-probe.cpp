// Diagnostic for screen sharing on a device or the emulator: opens the
// StreamCamera screen camera (CameraFacing::Screen) and counts the frames
// that arrive in five seconds.
// Build in the SDK build shell:
//   g++ -std=c++17 screengrab-probe.cpp $(pkg-config --cflags --libs streamcamera) -o screengrab-probe
#include <atomic>
#include <chrono>
#include <cstdio>
#include <thread>
#include <streamcamera.h>

using namespace Aurora::StreamCamera;

class Listener : public CameraListener
{
public:
    std::atomic<int> frames{0};
    void onCameraFrame(std::shared_ptr<GraphicBuffer> buffer) override
    {
        if (frames++ < 3) {
            std::printf("frame %ux%u format %s handle %d\n", buffer->width, buffer->height,
                        toString(buffer->pixelFormat).c_str(), static_cast<int>(buffer->handleType));
        }
    }
    void onCameraError(const std::string &error) override { std::printf("error: %s\n", error.c_str()); }
    void onCameraParameterChanged(CameraParameter, const std::string &) override {}
};

int main(int argc, char **argv)
{
    const PixelFormat format = argc > 1 && std::string(argv[1]) == "yuv" ? PixelFormat::YCbCrFlexible : PixelFormat::XRGB32;
    CameraManager *manager = StreamCameraManager();
    const int count = manager->getNumberOfCameras();
    std::printf("cameras: %d\n", count);
    for (int i = 0; i < count; ++i) {
        CameraInfo info;
        if (!manager->getCameraInfo(i, info)) continue;
        std::printf("  %d: %s (%s) facing %d\n", i, info.id.c_str(), info.provider.c_str(), static_cast<int>(info.facing));
        if (info.facing != CameraFacing::Screen) continue;
        std::vector<CameraCapability> caps;
        manager->queryCapabilities(info.id, caps);
        for (const CameraCapability &cap : caps) std::printf("     %ux%u@%u\n", cap.width, cap.height, cap.fps);
        std::shared_ptr<Camera> camera = manager->openCamera(info.id);
        if (!camera || caps.empty()) { std::printf("open failed\n"); return 1; }
        Listener listener;
        camera->setListener(&listener);
        std::printf("start: %d\n", camera->startCapture(caps.front(), format));
        std::this_thread::sleep_for(std::chrono::seconds(5));
        camera->stopCapture();
        std::printf("frames in 5 s: %d\n", listener.frames.load());
        return 0;
    }
    std::printf("no screen camera\n");
    return 1;
}
