#include <QtQuick>
#include <auroraapp.h>
#include <webenginecontext.h>
#include "appstate.h"
#include "clienttranslator.h"
#include "screencapture.h"
#include "containerloginstore.h"
#include "callcontrol.h"

int main(int argc, char *argv[])
{
    QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);

    // Private SDK adapter; a physical device keeps its normal camera backend.
    const QByteArray privateLibs("/usr/share/ru.mirea.JitsiClient/lib");
    if (QFile::exists("/usr/lib64/gstreamer-1.0/libgstemulatorcamsrc.so")
            && QFile::exists(QString::fromLatin1(privateLibs) + "/gstreamer-1.0/libgstemulatorprovider.so")) {
        QByteArray pluginPaths = privateLibs + "/gstreamer-1.0";
        const QByteArray existingPaths = qgetenv("GST_PLUGIN_PATH");
        if (!existingPaths.isEmpty()) pluginPaths += ':' + existingPaths;
        qputenv("GST_PLUGIN_PATH", pluginPaths);
        // GStreamer relocates its default plugin directory beside its private
        // library. The emulator's actual capture/decoder plugins stay in /usr.
        if (qgetenv("GST_PLUGIN_SYSTEM_PATH_1_0").isEmpty())
            qputenv("GST_PLUGIN_SYSTEM_PATH_1_0", "/usr/lib64/gstreamer-1.0");
        // StreamCamera reads one plugin directory. The private camera plugins
        // and the system screen camera (screengrab, which may not be bundled:
        // it depends on libvideopipe) are linked together in the cache.
        QByteArray pluginDir = privateLibs + "/streamcamera";
        const QString systemScreen = QStringLiteral("/usr/lib64/streamcamera/plugins/libstreamcamera-screengrab.so");
        const QString links = QDir::homePath() + QStringLiteral("/.cache/ru.mirea/JitsiClient/streamcamera");
        if (QFile::exists(systemScreen) && QDir().mkpath(links)) {
            const QDir bundled(QString::fromLatin1(pluginDir));
            QStringList sources;
            for (const QString &name : bundled.entryList({QStringLiteral("*.so")}, QDir::Files))
                sources << bundled.filePath(name);
            sources << systemScreen;
            for (const QString &source : sources) {
                const QString link = links + '/' + QFileInfo(source).fileName();
                if (QFileInfo(link).symLinkTarget() != source) {
                    QFile::remove(link);
                    QFile::link(source, link);
                }
            }
            pluginDir = links.toUtf8();
        }
        qputenv("STREAMCAMERA_PLUGIN_DIR", pluginDir);
        qputenv("GSTREAMER_CAMERA_DEVICE_PROVIDER", "aurorajitsiemulatorprovider");
    }
    Aurora::WebView::WebEngineContext::InitBrowser(argc, argv);

    QScopedPointer<QGuiApplication> application(Aurora::Application::application(argc, argv));
    application->setOrganizationName(QStringLiteral("ru.mirea"));
    application->setApplicationName(QStringLiteral("JitsiClient"));

    AppState appState;
    ScreenCapture screenCapture;
    appState.setScreenFrameSource(&screenCapture);
    QObject::connect(&screenCapture, &ScreenCapture::message, &appState, &AppState::appendCallLog, Qt::QueuedConnection);
    ContainerLoginStore loginStore;
    appState.setLoginStore(&loginStore);
    QObject::connect(&loginStore, &ContainerLoginStore::message, &appState, &AppState::appendCallLog);
    ClientTranslator english(Aurora::Application::pathTo("qml/languages/en.json").toLocalFile());
    auto applyLanguage = [&]() {
        application->removeTranslator(&english);
        if (appState.preferences().value("language").toString() == "en") application->installTranslator(&english);
    };
    applyLanguage();
    QObject::connect(&appState, &AppState::interfaceLanguageChanged, application.data(), applyLanguage);
    QScopedPointer<QQuickView> view(Aurora::Application::createView());
    view->rootContext()->setContextProperty(QStringLiteral("appState"), &appState);
    CallControl callControl;
    if (!callControl.registerOnBus()) appState.appendCallLog(QStringLiteral("notification actions are not available"));
    view->rootContext()->setContextProperty(QStringLiteral("callControl"), &callControl);
    view->setSource(Aurora::Application::pathTo(QStringLiteral("qml/JitsiClient.qml")));
    view->show();

    return application->exec();
}
