#pragma once

#include <QHash>
#include <QSqlDatabase>
#include <QString>
#include <QVariantList>

class QSettings;

// The application's local SQLite database: settings and the profile in the
// settings table, saved rooms in the rooms table. Logins and tokens are not
// kept here (see KeystoreLoginStore).
//
// Settings are read from memory and written through to the file, so a failed
// database still leaves a working session. Data of versions that kept
// everything in QSettings is moved in on the first start.
class Storage
{
public:
    Storage();
    ~Storage();

    // False when the file cannot be used; error() says why.
    bool open(const QString &file, QSettings *legacy);
    QString error() const { return m_error; }

    QVariant value(const QString &key, const QVariant &fallback = QVariant()) const;
    void setValue(const QString &key, const QVariant &value);
    void remove(const QString &key);
    // Removes a value and overwrites it in the database file.
    void erase(const QString &key);

    // Most recently used first, the rooms never used newest first.
    QVariantList rooms();
    // Adds the room or updates the row with its id.
    void saveRoom(const QVariantMap &room);
    void removeRoom(const QString &id);

private:
    bool createSchema();
    bool writeRoom(const QVariantMap &room);
    bool moveLegacy(QSettings *legacy);
    bool run(class QSqlQuery &query);

    QString m_connection;
    QSqlDatabase m_db;
    QHash<QString, QString> m_values;
    QString m_error;
};
