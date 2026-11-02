#ifndef SCREENCAPTURE_H
#define SCREENCAPTURE_H

#include <QByteArray>
#include <QMutex>
#include <QObject>
#include <memory>
#include <streamcamera.h>
#include "appstate.h"

// Screen sharing for the call page. The Aurora WebView cannot capture the
// screen (getDisplayMedia), and the platform offers it only through the
// StreamCamera API: a virtual camera with CameraFacing::Screen, listed to
// applications that have the ScreenCapture permission. The frames are kept
// as JPEG for the call page, which draws them on a canvas and sends the
// canvas stream to the meeting as the desktop track.
class ScreenCapture : public QObject, public Aurora::StreamCamera::CameraListener, public ScreenFrameSource
{
    Q_OBJECT
public:
    explicit ScreenCapture(QObject *parent = nullptr);
    ~ScreenCapture() override;

    bool start() override;
    void stop() override;
    bool running() const;
    QString error() const override;
    // The latest frame and its number; an empty array before the first one.
    QByteArray frame(quint64 *serial) const override;

    void onCameraFrame(std::shared_ptr<Aurora::StreamCamera::GraphicBuffer> buffer) override;
    void onCameraError(const std::string &errorDescription) override;
    void onCameraParameterChanged(Aurora::StreamCamera::CameraParameter, const std::string &) override;

signals:
    void message(const QString &text);

private:
    void setError(const QString &text);
    void store(const class QImage &image);

    std::shared_ptr<Aurora::StreamCamera::Camera> m_camera;
    mutable QMutex m_mutex;
    QByteArray m_jpeg;
    quint64 m_serial = 0;
    qint64 m_lastFrameMs = 0;
    int m_loggedFrames = 0;
    QString m_error;
};

#endif // SCREENCAPTURE_H
