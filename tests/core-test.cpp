#include "../src/appstate.h"
#include <QCoreApplication>
#include <QEventLoop>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QTimer>
#include <QUrl>
#include <QTemporaryDir>
#include <QSettings>
#include <QDebug>
#include <cstdio>
#include <cstdlib>

static void require(bool condition, const char *message)
{
    if (!condition) { std::fprintf(stderr, "FAIL: %s\n", message); std::exit(1); }
}

namespace {

class FakeScreen : public ScreenFrameSource
{
public:
    int starts = 0;
    bool start() override { ++starts; return true; }
    void stop() override {}
    QString error() const override { return QString(); }
    QByteArray frame(quint64 *) const override { return QByteArrayLiteral("jpeg"); }
};

class FakeLogins : public LoginStore
{
public:
    QVariantMap entries;
    QVariantMap load(const QString &host) override { return entries.value(host).toMap(); }
    void update(const QString &host, const QVariantMap &fields) override
    {
        QVariantMap entry = entries.value(host).toMap();
        for (auto it = fields.begin(); it != fields.end(); ++it) entry[it.key()] = it.value();
        entries[host] = entry;
    }
};

// What code on the call page can do: requests to the local server.
QNetworkReply *wait(QNetworkReply *reply)
{
    QEventLoop loop;
    QObject::connect(reply, &QNetworkReply::finished, &loop, &QEventLoop::quit);
    QTimer::singleShot(5000, &loop, &QEventLoop::quit);
    loop.exec();
    return reply;
}

int getStatus(QNetworkAccessManager &network, const QString &url)
{
    QNetworkReply *reply = wait(network.get(QNetworkRequest(QUrl(url))));
    const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    reply->deleteLater();
    return status;
}

void sendEvent(QNetworkAccessManager &network, const AppState &state, const QJsonObject &event)
{
    QNetworkRequest request(QUrl(state.meetingUrl() + "event"));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    request.setRawHeader("Origin", state.meetingOrigin().toUtf8());
    wait(network.post(request, QJsonDocument(event).toJson()))->deleteLater();
}

// index.html is taken from the installed application.
void checkLocalServer(const QString &directory)
{
    AppState state(nullptr, directory + "/server.ini");
    FakeScreen screen;
    FakeLogins logins;
    state.setScreenFrameSource(&screen);
    state.setLoginStore(&logins);
    QVariantMap room;
    room["id"] = "room";
    room["name"] = "CheckRoom";
    room["server"] = "https://meet.example.org";
    logins.update("meet.example.org", {{"liveStreamKey", "key-of-this-server"}});
    require(state.startMeeting(room, true, true, false), "meeting page opens");
    QNetworkAccessManager network;

    const QString frame = state.meetingUrl() + "screen.jpg";
    QNetworkReply *page = wait(network.get(QNetworkRequest(QUrl(state.meetingUrl()))));
    require(page->readAll().contains("key-of-this-server"), "the page gets the key of its server");
    page->deleteLater();

    require(getStatus(network, frame) == 403, "no frames without a request");
    sendEvent(network, state, {{"name", "screenShare"}, {"data", QJsonObject{{"active", true}}}});
    require(screen.starts == 0 && state.screenShareWaiting(), "a page request does not start the capture");
    require(getStatus(network, frame) == 202, "no frames while the question is open");
    state.answerScreenShare(false);
    require(screen.starts == 0 && getStatus(network, frame) == 403, "refusal gives no frames");
    sendEvent(network, state, {{"name", "screenShare"}, {"data", QJsonObject{{"active", true}}}});
    require(state.screenShareWaiting(), "a new request asks again");
    state.answerScreenShare(true);
    require(screen.starts == 1 && getStatus(network, frame) == 200, "frames after the answer");
    sendEvent(network, state, {{"name", "screenShare"}, {"data", QJsonObject{{"active", false}}}});
    require(getStatus(network, frame) == 403, "stopping closes the frames");
    sendEvent(network, state, {{"name", "screenShare"}, {"data", QJsonObject{{"active", true}}}});
    require(state.screenShareWaiting() && screen.starts == 1, "sharing again asks again");

    sendEvent(network, state, {{"name", "liveStreamKey"}, {"data", QJsonObject{{"key", "new-key"}}}});
    require(logins.load("meet.example.org").value("liveStreamKey") == "new-key", "stream key goes to the secure store");
    state.setPreference("liveStreamKey", "plain");
    require(!state.preferences().contains("liveStreamKey"), "stream key is not a preference");
    state.finishMeeting();
    require(!state.screenShareWaiting(), "the question ends with the meeting");
}

// A key from an earlier version does not stay in the database file.
void checkOldStreamKey(const QString &directory)
{
    const QString file = directory + "/old.ini";
    const QByteArray secret = "abcd-efgh-ijkl-mnop-old-key";
    { AppState state(nullptr, file); }
    const QString database = file + ".db";
    if (!QFile::exists(database)) return;
    {
        Storage store;
        QSettings none(directory + "/none.ini", QSettings::IniFormat);
        require(store.open(database, &none), "database opens");
        store.setValue("liveStreamKey", QString::fromLatin1(secret));
    }
    { AppState state(nullptr, file); require(!state.preferences().contains("liveStreamKey"), "old key is dropped"); }
    QFile raw(database);
    require(raw.open(QIODevice::ReadOnly) && !raw.readAll().contains(secret), "old key is overwritten in the file");
}

} // namespace

int main(int argc, char **argv)
{
    QCoreApplication application(argc, argv);
    QTemporaryDir dir;
    require(dir.isValid(), "temporary settings directory");
    const QString settingsFile = dir.path() + "/client.ini";
    AppState state(nullptr, settingsFile);
    require(state.server().isEmpty(), "default server is an empty field");
    require(!state.saveRoom("Preview only", false).isEmpty() && state.rooms().isEmpty(), "preview does not enter history");
    require(state.saveRoom("Default").value("server") == "https://meet.jit.si", "empty server uses meet.jit.si");
    state.removeRoom(state.rooms().first().toMap().value("id").toString());
    require(state.saveProfile("  Алексей  ", " ALEX@example.org "), "profile accepted");
    require(state.displayName() == "Алексей" && state.email() == "alex@example.org", "profile normalization");
    require(state.avatarUrl().contains("d=404"), "avatar missing-image fallback");
    AppState gravatarCheck(nullptr, dir.path() + "/gravatar.ini");
    require(gravatarCheck.saveProfile("Test", " MyEmailAddress@example.com "), "Gravatar sample email accepted");
    require(gravatarCheck.avatarUrl().contains("84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee"),
            "Gravatar SHA256 matches official example");
    require(!state.saveProfile("Name", "invalid-email"), "invalid email rejected");
    require(state.email() == "alex@example.org", "invalid save retains profile");
    require(state.saveSettings("meet.example.org/", true, false), "server normalization");
    require(state.server() == "https://meet.example.org", "normalized server");
    require(state.saveSettings("", true, false) && state.server().isEmpty(), "clearing server restores default");
    require(state.saveSettings("meet.example.org/", true, false), "custom server restored");
    require(state.preferences().value("soundMessage").toBool(), "sounds enabled by default");
    require(state.setPreference("hideSelfView", true), "self view preference");
    require(state.setPreference("soundMessage", false), "sound preference");
    require(state.setPreference("language", "en"), "meeting language");
    require(!state.setPreference("language", "unsupported"), "unsupported language rejected");
    require(!state.setPreference("hideSelfView", "false"), "string is not a boolean preference");
    require(!state.setPreference("unknown", true), "unknown preference rejected");
    require(!state.saveSettings("http://meet.example.org", false, false), "insecure server rejected");
    require(!state.saveSettings("https://user:pass@meet.example.org", false, false), "embedded credentials rejected");
    const QVariantMap first = state.saveRoom("Команда");
    require(!first.isEmpty() && first.value("server") == "https://meet.example.org", "room uses configured server");
    const QVariantMap same = state.saveRoom("Команда");
    require(same.value("id") == first.value("id") && state.rooms().size() == 1, "duplicate room deduplicated");
    const QVariantMap linked = state.saveRoom("https://another.example.org/Team%20Meeting#ignored");
    require(linked.value("server") == "https://another.example.org" && linked.value("name") == "Team Meeting", "full link split correctly");
    require(state.saveRoom("http://bad.example.org/Room").isEmpty(), "unsupported room link rejected");
    const QVariantMap bare = state.saveRoom("meet.otp.ru/МИРЭА", false);
    require(bare.value("server") == "https://meet.otp.ru" && bare.value("name") == "МИРЭА", "link without scheme split correctly");
    state.importLegacy("[\"Legacy room\"]", "Old name");
    state.importLegacy("[\"Should not import twice\"]", "Old name");
    require(state.rooms().size() == 3 && state.displayName() == "Алексей", "legacy migration is idempotent and retains profile");
    AppState reloaded(nullptr, settingsFile);
    require(reloaded.preferences().value("hideSelfView").toBool()
            && !reloaded.preferences().value("soundMessage").toBool()
            && reloaded.preferences().value("language") == "en", "meeting preferences survive restart");
    require(reloaded.rooms().size() == 3 && reloaded.audioMuted() && !reloaded.videoMuted(), "settings survive restart");
    reloaded.removeRoom(linked.value("id").toString());
    require(reloaded.rooms().size() == 2, "remove targets only selected room");
    const QVariantMap kept = reloaded.saveRoom("Без встреч");
    AppState reloadedAgain(nullptr, settingsFile);
    require(reloadedAgain.rooms().first().toMap().value("id") == kept.value("id"), "newest unused room comes first after restart");
    require(!reloadedAgain.rooms().first().toMap().contains("duration"), "a room without meetings has no duration");

    // Data of the versions that kept everything in QSettings.
    const QString oldFile = dir.path() + "/old.ini";
    {
        QSettings old(oldFile, QSettings::IniFormat);
        old.setValue("client/name", "Старое имя");
        old.setValue("client/hideSelfView", true);
        old.setValue("client/soundMessage", false);
        old.setValue("client/rooms", QByteArray("[{\"id\":\"new\",\"name\":\"Новая\",\"server\":\"https://meet.jit.si\",\"lastUsed\":0},"
                                               "{\"id\":\"used\",\"name\":\"Была\",\"server\":\"https://meet.jit.si\",\"lastUsed\":100,\"duration\":61}]"));
        old.setValue("desktop/other", 1);
    }
    {
        AppState moved(nullptr, oldFile);
        require(moved.displayName() == "Старое имя", "old profile moved");
        require(moved.preferences().value("hideSelfView").toBool() && !moved.preferences().value("soundMessage").toBool(), "old preferences moved");
        require(moved.rooms().size() == 2 && moved.rooms().first().toMap().value("id") == "used", "old rooms moved and sorted");
        require(moved.rooms().first().toMap().value("duration").toInt() == 61, "old duration moved");
        require(moved.setPreference("hideSelfView", false), "preference after the move");
    }
    {
        QSettings old(oldFile, QSettings::IniFormat);
        require(!old.contains("client/name") && old.contains("desktop/other"), "only the moved group is removed");
        AppState again(nullptr, oldFile);
        require(!again.preferences().value("hideSelfView").toBool() && again.rooms().size() == 2, "the move happens once");
    }
    require(state.initials("Алексей Иванов") == "АИ", "Cyrillic initials");
    require(!state.isTrustedOrigin("https://meet.example.org.evil.org"), "no media trust outside active session");
    checkOldStreamKey(dir.path());
    checkLocalServer(dir.path());
    qInfo() << "PASS: profile, Gravatar hash, default server, validation, rooms, links, migration, persistence, database, initials";
    return 0;
}
