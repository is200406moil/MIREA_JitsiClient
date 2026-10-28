#include <QGuiApplication>
#include <QQuickView>
#include <QQmlContext>
#include <QQmlComponent>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTimer>
#include <QUrl>
#include <webenginecontext.h>
#include <cstdio>

// An offline WebRTC test: no Jitsi, remote sites, accounts, saved images or device IDs.
static const char html[] = R"HTML(<!doctype html><meta charset="utf-8">
<title>Local camera diagnostic</title><video id="preview" autoplay muted playsinline></video>
<script>
(async function () {
  const result = { secureContext: window.isSecureContext, videoInput: 0, audioInput: 0 };
  let stream;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    result.videoInput = devices.filter(d => d.kind === 'videoinput').length;
    result.audioInput = devices.filter(d => d.kind === 'audioinput').length;
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const video = document.getElementById('preview');
    video.srcObject = stream;
    await video.play();
    let frames = 0;
    await Promise.race([
      new Promise(resolve => {
        function onFrame() {
          if (++frames >= 30) resolve();
          else video.requestVideoFrameCallback(onFrame);
        }
        video.requestVideoFrameCallback(onFrame);
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('NoFrameTimeout')), 10000))
    ]);
    result.frameWidth = video.videoWidth;
    result.frameHeight = video.videoHeight;
    result.frames = frames;
    result.capture = 'frame';
  } catch (error) { result.error = error.name; result.message = error.message; }
  finally { if (stream) stream.getTracks().forEach(track => track.stop()); }
  await fetch('/result', { method: 'POST', body: JSON.stringify(result) });
}());
</script>)HTML";

int main(int argc, char **argv)
{
    QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);
    Aurora::WebView::WebEngineContext::InitBrowser(argc, argv);
    QGuiApplication app(argc, argv);
    app.setApplicationName("JitsiCameraDiagnostic");
    QTcpServer server;
    if (!server.listen(QHostAddress::LocalHost, 0)) return 1;
    QObject::connect(&server, &QTcpServer::newConnection, [&]() {
        while (server.hasPendingConnections()) {
            auto socket = server.nextPendingConnection();
            QObject::connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
            QObject::connect(socket, &QTcpSocket::readyRead, [&, socket]() {
                QByteArray request = socket->property("request").toByteArray() + socket->readAll();
                if (request.size() > 16384) { socket->close(); return; }
                socket->setProperty("request", request);
                int split = request.indexOf("\r\n\r\n");
                if (split < 0) return;
                int length = 0;
                for (const auto &line : request.left(split).split('\n'))
                    if (line.toLower().startsWith("content-length:")) length = line.mid(15).trimmed().toInt();
                if (request.size() < split + 4 + length) return;
                QByteArray body;
                if (request.startsWith("POST /result ")) {
                    std::fprintf(stderr, "WEB_CAMERA_RESULT %s\n", request.mid(split + 4, length).constData());
                    if (qgetenv("JITSI_CAMERA_PROBE_HOLD").isEmpty())
                        QTimer::singleShot(500, &app, &QCoreApplication::quit);
                    body = "OK";
                } else body = html;
                socket->write("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: "
                    + QByteArray::number(body.size()) + "\r\n\r\n" + body);
                socket->disconnectFromHost();
            });
        }
    });
    const QString origin = QString("http://127.0.0.1:%1").arg(server.serverPort());
    QQuickView view;
    view.rootContext()->setContextProperty("probeUrl", origin + "/");
    view.rootContext()->setContextProperty("probeOrigin", origin);
    QQmlComponent component(view.engine());
    component.setData(R"QML(
import QtQuick 2.6
import ru.auroraos.WebView 1.0
import ru.auroraos.WebView.Global 1.0
Rectangle {
    width: 360; height: 640; color: "#101820"
    WebView { anchors.fill: parent; url: probeUrl }
    Connections {
        target: PermissionHandler
        onMediaAccessRequested: {
            if (String(mediaAccessRequest.requestingOrigin).replace(/\/$/, "") === probeOrigin) mediaAccessRequest.accept()
            else mediaAccessRequest.deny()
        }
        onPermissionsRequested: {
            var allowed = String(permissionRequest.requestingOrigin).replace(/\/$/, "") === probeOrigin
            for (var i = 0; i < permissionRequest.requestedPermissions.length; ++i)
                if (permissionRequest.requestedPermissions[i] !== Permissions.CEF_PERMISSION_TYPE_CAMERA_STREAM) allowed = false
            if (allowed) permissionRequest.accept(); else permissionRequest.deny()
        }
    }
})QML", QUrl());
    QObject *root = component.create();
    if (!root) { std::fprintf(stderr, "QML_ERROR %s\n", qPrintable(component.errorString())); return 1; }
    view.setContent(QUrl(), &component, root);
    view.setTitle("Local camera diagnostic");
    view.show();
    QTimer::singleShot(30000, [&]() { std::fprintf(stderr, "WEB_CAMERA_TIMEOUT\n"); app.quit(); });
    return app.exec();
}
