#include "storage.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSettings>
#include <QSqlError>
#include <QSqlQuery>
#include <QUuid>
#include <QVariantMap>

namespace {

const int SchemaVersion = 1;
const QString LegacyGroup = QStringLiteral("client");

} // namespace

Storage::Storage()
    : m_connection(QUuid::createUuid().toString())
{
}

Storage::~Storage()
{
    if (!m_db.isValid()) return;
    m_db.close();
    m_db = QSqlDatabase();
    QSqlDatabase::removeDatabase(m_connection);
}

bool Storage::run(QSqlQuery &query)
{
    if (query.exec()) return true;
    m_error = query.lastError().text();
    return false;
}

bool Storage::open(const QString &file, QSettings *legacy)
{
    QDir().mkpath(QFileInfo(file).absolutePath());
    m_db = QSqlDatabase::addDatabase(QStringLiteral("QSQLITE"), m_connection);
    m_db.setDatabaseName(file);
    if (!m_db.open()) {
        m_error = m_db.lastError().text();
        return false;
    }
    QFile::setPermissions(file, QFile::ReadOwner | QFile::WriteOwner);

    QSqlQuery version(m_db);
    version.prepare(QStringLiteral("PRAGMA user_version"));
    if (!run(version) || !version.next()) return false;
    if (version.value(0).toInt() == 0) {
        version.finish();
        if (!m_db.transaction()) {
            m_error = m_db.lastError().text();
            return false;
        }
        if (!createSchema() || !moveLegacy(legacy) || !m_db.commit()) {
            if (m_error.isEmpty()) m_error = m_db.lastError().text();
            m_db.rollback();
            return false;
        }
        // Removed only now: a failed move keeps the old data for the next start.
        legacy->remove(LegacyGroup);
        legacy->sync();
    } else {
        version.finish();
    }

    QSqlQuery settings(m_db);
    settings.prepare(QStringLiteral("SELECT key, value FROM settings"));
    if (!run(settings)) return false;
    while (settings.next()) m_values.insert(settings.value(0).toString(), settings.value(1).toString());
    return true;
}

bool Storage::createSchema()
{
    const QStringList statements = {
        QStringLiteral("CREATE TABLE settings ("
                       "key TEXT PRIMARY KEY NOT NULL, "
                       "value TEXT NOT NULL)"),
        QStringLiteral("CREATE TABLE rooms ("
                       "id TEXT PRIMARY KEY NOT NULL, "
                       "name TEXT NOT NULL, "
                       "server TEXT NOT NULL, "
                       "last_used INTEGER NOT NULL DEFAULT 0, "
                       "duration INTEGER)"),
        QStringLiteral("CREATE INDEX rooms_last_used ON rooms (last_used)"),
        QStringLiteral("PRAGMA user_version = %1").arg(SchemaVersion),
    };
    for (const QString &statement : statements) {
        QSqlQuery query(m_db);
        query.prepare(statement);
        if (!run(query)) return false;
    }
    return true;
}

bool Storage::moveLegacy(QSettings *legacy)
{
    legacy->beginGroup(LegacyGroup);
    const QStringList keys = legacy->childKeys();
    bool done = true;
    for (const QString &key : keys) {
        if (key == QLatin1String("rooms")) continue;
        QSqlQuery query(m_db);
        query.prepare(QStringLiteral("INSERT INTO settings (key, value) VALUES (?, ?)"));
        query.addBindValue(key);
        query.addBindValue(legacy->value(key).toString());
        if (!run(query)) { done = false; break; }
    }
    // The old list is newest first; rows are read back in reverse insertion order.
    const QJsonArray rooms = QJsonDocument::fromJson(legacy->value(QStringLiteral("rooms")).toByteArray()).array();
    legacy->endGroup();
    for (int i = rooms.size() - 1; done && i >= 0; --i) done = writeRoom(rooms.at(i).toObject().toVariantMap());
    return done;
}

QVariant Storage::value(const QString &key, const QVariant &fallback) const
{
    const auto found = m_values.constFind(key);
    return found == m_values.constEnd() ? fallback : QVariant(*found);
}

void Storage::setValue(const QString &key, const QVariant &value)
{
    const QString text = value.toString();
    m_values.insert(key, text);
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"));
    query.addBindValue(key);
    query.addBindValue(text);
    run(query);
}

void Storage::remove(const QString &key)
{
    m_values.remove(key);
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("DELETE FROM settings WHERE key = ?"));
    query.addBindValue(key);
    run(query);
}

QVariantList Storage::rooms()
{
    QVariantList result;
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("SELECT id, name, server, last_used, duration FROM rooms "
                                 "ORDER BY last_used DESC, rowid DESC"));
    if (!run(query)) return result;
    while (query.next()) {
        QVariantMap room;
        room["id"] = query.value(0);
        room["name"] = query.value(1);
        room["server"] = query.value(2);
        room["lastUsed"] = query.value(3).toLongLong();
        // Absent until the first meeting in the room has ended.
        if (!query.isNull(4)) room["duration"] = query.value(4).toLongLong();
        result.append(room);
    }
    return result;
}

bool Storage::writeRoom(const QVariantMap &room)
{
    // Not INSERT OR REPLACE: the row keeps its rowid, which orders new rooms.
    const QVariant duration = room.contains("duration") ? room.value("duration") : QVariant(QVariant::LongLong);
    QSqlQuery update(m_db);
    update.prepare(QStringLiteral("UPDATE rooms SET name = ?, server = ?, last_used = ?, duration = ? WHERE id = ?"));
    update.addBindValue(room.value("name"));
    update.addBindValue(room.value("server"));
    update.addBindValue(room.value("lastUsed").toLongLong());
    update.addBindValue(duration);
    update.addBindValue(room.value("id"));
    if (!run(update)) return false;
    if (update.numRowsAffected() > 0) return true;

    QSqlQuery insert(m_db);
    insert.prepare(QStringLiteral("INSERT INTO rooms (id, name, server, last_used, duration) VALUES (?, ?, ?, ?, ?)"));
    insert.addBindValue(room.value("id"));
    insert.addBindValue(room.value("name"));
    insert.addBindValue(room.value("server"));
    insert.addBindValue(room.value("lastUsed").toLongLong());
    insert.addBindValue(duration);
    return run(insert);
}

void Storage::saveRoom(const QVariantMap &room)
{
    writeRoom(room);
}

void Storage::erase(const QString &key)
{
    QSqlQuery secure(m_db);
    secure.prepare(QStringLiteral("PRAGMA secure_delete = ON"));
    run(secure);
    remove(key);
    QSqlQuery vacuum(m_db);
    vacuum.prepare(QStringLiteral("VACUUM"));
    run(vacuum);
}

void Storage::removeRoom(const QString &id)
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("DELETE FROM rooms WHERE id = ?"));
    query.addBindValue(id);
    run(query);
}
