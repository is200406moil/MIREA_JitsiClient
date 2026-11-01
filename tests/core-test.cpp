#include "../src/appstate.h"
#include <QCoreApplication>
#include <QTemporaryDir>
#include <QDebug>
#include <cstdlib>

static void require(bool condition, const char *message)
{
    if (!condition) { qCritical() << "FAIL:" << message; std::exit(1); }
}

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
    require(state.initials("Алексей Иванов") == "АИ", "Cyrillic initials");
    require(!state.isTrustedOrigin("https://meet.example.org.evil.org"), "no media trust outside active session");
    qInfo() << "PASS: profile, Gravatar hash, default server, validation, rooms, links, migration, persistence, initials";
    return 0;
}
