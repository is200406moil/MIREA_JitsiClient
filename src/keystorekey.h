#ifndef KEYSTOREKEY_H
#define KEYSTOREKEY_H

#include <QString>

// The password of the logins container, computed in the system key store
// (Aurora Keystore, the USERAPP token, through the qca-aurora-pkcs11 plugin).
// The key lives in the store and cannot be read out: the password is the
// HMAC-SHA256 of a fixed message under that key, so nothing secret is kept
// in the application's files. The key is generated on first use.
//
// Returns the password as 64 hex digits, or an empty string and the reason
// in error when the store cannot be used.
QString keystoreContainerPassword(QString *error);

#endif // KEYSTOREKEY_H
