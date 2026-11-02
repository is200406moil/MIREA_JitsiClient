#include "screencapture.h"

#include <QBuffer>
#include <QDateTime>
#include <QImage>
#include <QMutexLocker>

using namespace Aurora::StreamCamera;

namespace {

// Frames sent to the page per second; a screen changes slowly and every
// frame is encoded as JPEG on the camera thread.
constexpr qint64 FrameIntervalMs = 200;
// The longer side of the shared picture.
constexpr int MaxSide = 1280;

inline uchar clamp(int value)
{
    return static_cast<uchar>(value < 0 ? 0 : (value > 255 ? 255 : value));
}

} // namespace

ScreenCapture::ScreenCapture(QObject *parent)
    : QObject(parent)
{
}

ScreenCapture::~ScreenCapture()
{
    stop();
}

bool ScreenCapture::start()
{
    if (m_camera) return true;
    {
        QMutexLocker lock(&m_mutex);
        m_error.clear();
        m_jpeg.clear();
    }
    CameraManager *manager = StreamCameraManager();
    if (!manager) {
        setError("StreamCamera is not available");
        return false;
    }
    manager->init();
    CameraInfo screen;
    bool found = false;
    const int count = manager->getNumberOfCameras();
    for (int i = 0; i < count && !found; ++i) {
        CameraInfo info;
        if (manager->getCameraInfo(i, info) && info.facing == CameraFacing::Screen) {
            screen = info;
            found = true;
        }
    }
    if (!found) {
        setError("No screen camera (ScreenCapture permission or screengrab service missing)");
        return false;
    }
    std::vector<CameraCapability> caps;
    if (!manager->queryCapabilities(screen.id, caps) || caps.empty()) {
        setError("The screen camera reports no capabilities");
        return false;
    }
    // The largest mode; frames are scaled down when encoded.
    CameraCapability cap = caps.front();
    for (const CameraCapability &candidate : caps) {
        if (candidate.width * candidate.height > cap.width * cap.height) cap = candidate;
    }
    m_camera = manager->openCamera(screen.id);
    if (!m_camera) {
        setError("The screen camera could not be opened");
        return false;
    }
    m_camera->setListener(this);
    // RGB frames when the screen camera offers them, YCbCr otherwise.
    PixelFormat format = PixelFormat::YCbCrFlexible;
    QStringList formats;
    for (PixelFormat supported : m_camera->getSupportedPixelFormats()) {
        formats << QString::fromStdString(toString(supported));
        if (supported == PixelFormat::XRGB32) format = PixelFormat::XRGB32;
    }
    m_loggedFrames = 0;
    emit message(QStringLiteral("screen camera formats: %1, using %2")
                 .arg(formats.join(','), QString::fromStdString(toString(format))));
    if (!m_camera->startCapture(cap, format)) {
        m_camera.reset();
        setError("The screen capture did not start");
        return false;
    }
    emit message(QStringLiteral("screen capture started %1x%2 (%3)")
                 .arg(cap.width).arg(cap.height).arg(QString::fromStdString(screen.provider)));
    return true;
}

void ScreenCapture::stop()
{
    if (!m_camera) return;
    m_camera->stopCapture();
    m_camera->setListener(nullptr);
    m_camera.reset();
    QMutexLocker lock(&m_mutex);
    m_jpeg.clear();
}

bool ScreenCapture::running() const
{
    return static_cast<bool>(m_camera);
}

QString ScreenCapture::error() const
{
    QMutexLocker lock(&m_mutex);
    return m_error;
}

QByteArray ScreenCapture::frame(quint64 *serial) const
{
    QMutexLocker lock(&m_mutex);
    if (serial) *serial = m_serial;
    return m_jpeg;
}

void ScreenCapture::onCameraFrame(std::shared_ptr<GraphicBuffer> buffer)
{
    const qint64 now = QDateTime::currentMSecsSinceEpoch();
    if (!buffer || now - m_lastFrameMs < FrameIntervalMs) return;
    m_lastFrameMs = now;
    const bool logFrame = m_loggedFrames < 3;
    if (logFrame) {
        ++m_loggedFrames;
        emit message(QStringLiteral("screen frame %1x%2 %3 handle %4")
                     .arg(buffer->width).arg(buffer->height)
                     .arg(QString::fromStdString(toString(buffer->pixelFormat)))
                     .arg(static_cast<int>(buffer->handleType)));
    }
    if (buffer->pixelFormat == PixelFormat::XRGB32) {
        std::shared_ptr<const RawImageFrame> raw = buffer->map();
        if (!raw || !raw->data || raw->width == 0 || raw->height == 0) {
            if (logFrame) emit message(QStringLiteral("screen frame could not be mapped"));
            return;
        }
        const int stride = static_cast<int>(raw->size / raw->height);
        const QImage view(raw->data, raw->width, raw->height, stride, QImage::Format_RGB32);
        const QImage image = qMax(view.width(), view.height()) > MaxSide
            ? view.scaled(MaxSide, MaxSide, Qt::KeepAspectRatio, Qt::FastTransformation)
            : view.copy();
        store(image);
        return;
    }
    std::shared_ptr<const YCbCrFrame> yuv = buffer->mapYCbCr();
    if (!yuv || !yuv->y || !yuv->cb || !yuv->cr || yuv->width <= 0 || yuv->height <= 0) {
        if (logFrame) emit message(QStringLiteral("screen frame could not be mapped as YCbCr"));
        return;
    }

    // Every step-th pixel of the source, BT.601 YCbCr to RGB.
    const int step = qMax(1, (qMax(yuv->width, yuv->height) + MaxSide - 1) / MaxSide);
    const int width = yuv->width / step;
    const int height = yuv->height / step;
    QImage image(width, height, QImage::Format_RGB32);
    for (int row = 0; row < height; ++row) {
        const int sy = row * step;
        const uint8_t *yLine = yuv->y + sy * yuv->yStride;
        const uint8_t *cbLine = yuv->cb + (sy / 2) * yuv->cStride;
        const uint8_t *crLine = yuv->cr + (sy / 2) * yuv->cStride;
        QRgb *out = reinterpret_cast<QRgb *>(image.scanLine(row));
        for (int column = 0; column < width; ++column) {
            const int sx = column * step;
            const int c = (sx / 2) * yuv->chromaStep;
            const int luma = (yLine[sx] - 16) * 298;
            const int cb = cbLine[c] - 128;
            const int cr = crLine[c] - 128;
            out[column] = qRgb(clamp((luma + 409 * cr + 128) >> 8),
                               clamp((luma - 100 * cb - 208 * cr + 128) >> 8),
                               clamp((luma + 516 * cb + 128) >> 8));
        }
    }
    store(image);
}

void ScreenCapture::store(const QImage &image)
{
    QByteArray jpeg;
    QBuffer device(&jpeg);
    device.open(QIODevice::WriteOnly);
    image.save(&device, "JPEG", 70);
    QMutexLocker lock(&m_mutex);
    m_jpeg = jpeg;
    ++m_serial;
}

void ScreenCapture::onCameraError(const std::string &errorDescription)
{
    setError(QString::fromStdString(errorDescription));
}

void ScreenCapture::onCameraParameterChanged(CameraParameter, const std::string &)
{
}

void ScreenCapture::setError(const QString &text)
{
    {
        QMutexLocker lock(&m_mutex);
        m_error = text;
    }
    // Emitted from the camera thread too; the connection is queued.
    emit message(QStringLiteral("screen capture error: ") + text);
}
