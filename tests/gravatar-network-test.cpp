#include "../src/appstate.h"
#include <QCoreApplication>
#include <QEventLoop>
#include <QImage>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QTemporaryDir>
#include <QTimer>
#include <QDebug>

int main(int argc, char **argv)
{
    QCoreApplication application(argc, argv);
    QTemporaryDir directory;
    AppState state(nullptr, directory.path() + "/profile.ini");
    if (!state.saveProfile("Gravatar", "support@gravatar.com")) return 1;

    QNetworkAccessManager manager;
    QNetworkReply *reply = manager.get(QNetworkRequest(QUrl(state.avatarUrl())));
    QEventLoop loop;
    QTimer timer;
    timer.setSingleShot(true);
    QObject::connect(&timer, &QTimer::timeout, &loop, &QEventLoop::quit);
    QObject::connect(reply, &QNetworkReply::finished, &loop, &QEventLoop::quit);
    timer.start(15000);
    loop.exec();

    const QByteArray bytes = reply->readAll();
    QImage image;
    const bool loaded = reply->isFinished() && reply->error() == QNetworkReply::NoError
        && reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 200
        && image.loadFromData(bytes) && !image.isNull();
    if (!loaded) {
        qCritical() << "FAIL: Gravatar image" << reply->errorString()
                    << reply->attribute(QNetworkRequest::HttpStatusCodeAttribute) << bytes.size();
        return 1;
    }
    qInfo() << "PASS: Gravatar image downloaded and decoded" << image.size();
    return 0;
}
