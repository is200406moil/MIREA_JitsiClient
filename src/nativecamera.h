#ifndef NATIVECAMERA_H
#define NATIVECAMERA_H

#include <QByteArray>
#include <QImage>
#include <QMutex>
#include <QObject>
#include "appstate.h"

// The camera for the call page on Aurora OS 5.1. The Gecko WebView opens the
// camera through StreamCamera, which on some devices (KVADRA_T) starts the
// capture but delivers no frames; the Qt camera (the one of the prejoin
// preview) works there. The page asks for it (nativeCamera event), the
// application runs a Camera in QML (NativeCameraSource.qml), and the pictures
// go to the page as JPEG (camera.jpg), which draws them on a canvas and sends
// the canvas stream as the camera track.
class NativeCamera : public QObject, public ScreenFrameSource
{
    Q_OBJECT
    Q_PROPERTY(bool active READ active NOTIFY activeChanged)
    Q_PROPERTY(QString facing READ facing WRITE setFacing NOTIFY facingChanged)
    // The shorter side of the largest picture the server sends (its
    // resolution setting); the camera mode is chosen within it.
    Q_PROPERTY(int maxHeight READ maxHeight WRITE setMaxHeight NOTIFY maxHeightChanged)

public:
    explicit NativeCamera(QObject *parent = nullptr);
    ~NativeCamera() override;

    bool active() const { return m_active; }
    QString facing() const { return m_facing; }
    void setFacing(const QString &facing);
    int maxHeight() const { return m_maxHeight; }
    void setMaxHeight(int height);

    Q_INVOKABLE bool start() override;
    Q_INVOKABLE void stop() override;
    QString error() const override;
    QByteArray frame(quint64 *serial) const override;

    // A picture of the viewfinder (NativeCameraSource.qml). Qt Multimedia
    // is not linked to the application: on Aurora OS 5.1 (KVADRA_T) the
    // viewfinder crashes then.
    Q_INVOKABLE void pushImage(const QImage &image);
    Q_INVOKABLE void reportError(const QString &text);
    // A line for the call log.
    Q_INVOKABLE void note(const QString &text) { emit message(text); }

signals:
    void activeChanged();
    void facingChanged();
    void maxHeightChanged();
    void message(const QString &text);

private:
    void store(const QImage &image);

    bool m_active = false;
    QString m_facing = QStringLiteral("user");
    int m_maxHeight = 720;
    int m_loggedGrabs = 0;
    mutable QMutex m_mutex;
    QByteArray m_jpeg;
    quint64 m_serial = 0;
    QString m_error;
};

#endif // NATIVECAMERA_H
