#include "nativecamera.h"

#include <QBuffer>
#include <QMutexLocker>

namespace {

// The longer side of the picture sent to the page at most, whatever mode
// the camera is in.
constexpr int MaxSide = 1920;

} // namespace

NativeCamera::NativeCamera(QObject *parent)
    : QObject(parent)
{
}

NativeCamera::~NativeCamera() = default;

void NativeCamera::setFacing(const QString &facing)
{
    const QString value = facing == QLatin1String("environment") ? facing : QStringLiteral("user");
    if (value == m_facing) return;
    m_facing = value;
    {
        QMutexLocker lock(&m_mutex);
        m_jpeg.clear();
    }
    emit facingChanged();
}

void NativeCamera::setMaxHeight(int height)
{
    const int value = qBound(180, height, 1080);
    if (value == m_maxHeight) return;
    m_maxHeight = value;
    emit maxHeightChanged();
}

bool NativeCamera::start()
{
    {
        QMutexLocker lock(&m_mutex);
        m_error.clear();
        m_jpeg.clear();
    }
    m_loggedGrabs = 0;
    if (!m_active) {
        m_active = true;
        emit activeChanged();
    }
    return true;
}

void NativeCamera::stop()
{
    {
        QMutexLocker lock(&m_mutex);
        m_jpeg.clear();
    }
    if (m_active) {
        m_active = false;
        emit activeChanged();
    }
}

QString NativeCamera::error() const
{
    QMutexLocker lock(&m_mutex);
    return m_error;
}

QByteArray NativeCamera::frame(quint64 *serial) const
{
    QMutexLocker lock(&m_mutex);
    if (serial) *serial = m_serial;
    return m_jpeg;
}

void NativeCamera::pushImage(const QImage &image)
{
    if (!m_active || image.isNull()) return;
    if (m_loggedGrabs < 2) {
        ++m_loggedGrabs;
        emit message(QStringLiteral("native camera %1 picture %2x%3").arg(m_facing).arg(image.width()).arg(image.height()));
    }
    store(qMax(image.width(), image.height()) > MaxSide
          ? image.scaled(MaxSide, MaxSide, Qt::KeepAspectRatio, Qt::SmoothTransformation)
          : image);
}

void NativeCamera::store(const QImage &image)
{
    QByteArray jpeg;
    QBuffer device(&jpeg);
    device.open(QIODevice::WriteOnly);
    image.save(&device, "JPEG", 75);
    QMutexLocker lock(&m_mutex);
    m_jpeg = jpeg;
    ++m_serial;
}

void NativeCamera::reportError(const QString &text)
{
    {
        QMutexLocker lock(&m_mutex);
        m_error = text;
    }
    emit message(QStringLiteral("native camera error: ") + text);
}
