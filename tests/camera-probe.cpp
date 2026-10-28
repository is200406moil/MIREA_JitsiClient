#include <QGuiApplication>
#include <QCamera>
#include <QCameraInfo>
#include <QAbstractVideoSurface>
#include <QVideoFrame>
#include <QTimer>
#include <cstdio>
#include <QDebug>

class FrameProbe : public QAbstractVideoSurface {
public:
    using QAbstractVideoSurface::QAbstractVideoSurface;
    QList<QVideoFrame::PixelFormat> supportedPixelFormats(QAbstractVideoBuffer::HandleType) const override {
        QList<QVideoFrame::PixelFormat> formats;
        for (int i = 1; i <= 32; ++i) formats.append(static_cast<QVideoFrame::PixelFormat>(i));
        return formats;
    }
    bool present(const QVideoFrame &frame) override {
        if (frame.isValid()) {
            std::fprintf(stderr, "NATIVE_CAMERA_FRAME %dx%d\n", frame.width(), frame.height());
            QCoreApplication::exit(0);
        }
        return true;
    }
};

int main(int argc, char **argv) {
    QGuiApplication app(argc, argv);
    qInstallMessageHandler([](QtMsgType, const QMessageLogContext &, const QString &message) {
        std::fprintf(stderr, "QT: %s\n", qPrintable(message));
    });
    if (app.arguments().contains("--gst"))
        app.setLibraryPaths(QStringList() << "/tmp/jitsi-camera-plugins");
    const auto cameras = QCameraInfo::availableCameras();
    std::fprintf(stderr, "NATIVE_CAMERA_COUNT %d\n", cameras.size());
    if (cameras.isEmpty()) return 2;
    for (const auto &info : cameras)
        std::fprintf(stderr, "NATIVE_CAMERA_DEVICE %s %s\n", qPrintable(info.deviceName()), qPrintable(info.description()));
    const int selected = app.arguments().contains("--second") && cameras.size() > 1 ? 1 : 0;
    QCamera camera(cameras.at(selected));
    FrameProbe surface;
    camera.setViewfinder(&surface);
    QObject::connect(&camera, &QCamera::statusChanged, [&](QCamera::Status status) {
        std::fprintf(stderr, "NATIVE_CAMERA_STATUS %d\n", int(status));
    });
    QObject::connect(&camera, static_cast<void(QCamera::*)(QCamera::Error)>(&QCamera::error),
        [&](QCamera::Error error) { std::fprintf(stderr, "NATIVE_CAMERA_ERROR %d %s\n", int(error), qPrintable(camera.errorString())); });
    QTimer::singleShot(12000, [&]() { std::fprintf(stderr, "NATIVE_CAMERA_TIMEOUT\n"); app.exit(3); });
    camera.start();
    const int result = app.exec();
    camera.stop();
    return result;
}
