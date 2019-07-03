const jwt = require("jwt-simple");
let User, Config, ResponseMessages;

const ROLES = {
    get ADMIN() {
        return "ADMIN";
    },
    get GENERAL_USER() {
        return "GENERAL_USER";
    }
};

const PERMISSIONS = {
    //
    // USERS
    get USERS_GET_ALL() {
        return "USERS_GET_ALL";
    },
    get USERS_GET() {
        return "USERS_GET";
    },
    get USERS_ADD() {
        return "USERS_ADD";
    },
    get USERS_UPDATE() {
        return "USERS_UPDATE";
    },
    get USERS_DELETE() {
        return "USERS_DELETE";
    },
    get USERS_ARCHIVE() {
        return "USERS_ARCHIVE";
    },
    get USERS_ACTIVATE() {
        return "USERS_ACTIVATE";
    },
    get USERS_GET_ALL_AVAILABLE_USER_ROLES() {
        return "USERS_GET_ALL_AVAILABLE_USER_ROLES";
    },
    //
    // BOARDS
    get BOARDS_GET_ALL() {
        return "BOARDS_GET_ALL";
    },
    get BOARDS_GET() {
        return "BOARDS_GET";
    },
    get BOARDS_ADD() {
        return "BOARDS_ADD";
    },
    get BOARDS_DELETE() {
        return "BOARDS_DELETE";
    },
    get BOARDS_UPDATE() {
        return "BOARDS_UPDATE";
    },
    get BOARDS_CLOSE() {
        return "BOARDS_CLOSE";
    },
    get BOARDS_OPEN() {
        return "BOARDS_OPEN";
    },
    //
    // LISTS
    get LISTS_GET_ALL() {
        return "LISTS_GET_ALL";
    },
    get LISTS_GET() {
        return "LISTS_GET";
    },
    get LISTS_ADD() {
        return "LISTS_ADD";
    },
    get LISTS_DELETE() {
        return "LISTS_DELETE";
    },
    get LISTS_UPDATE() {
        return "LISTS_UPDATE";
    },
    get LISTS_CLOSE() {
        return "LISTS_CLOSE";
    },
    get LISTS_OPEN() {
        return "LISTS_OPEN";
    }
};

const PERMISSIONS_BY_ROLES = [
    {
        role: ROLES.ADMIN,
        inherits: [ROLES.GENERAL_USER],
        permissions: [
            //
            // USERS
            PERMISSIONS.USERS_GET_ALL,
            PERMISSIONS.USERS_GET,
            PERMISSIONS.USERS_ADD,
            PERMISSIONS.USERS_ARCHIVE,
            PERMISSIONS.USERS_ACTIVATE,
            PERMISSIONS.USERS_UPDATE,
            PERMISSIONS.USERS_DELETE
        ]
    },
    {
        role: ROLES.GENERAL_USER,
        permissions: [
            //
            // BOARDS
            PERMISSIONS.BOARDS_GET_ALL,
            PERMISSIONS.BOARDS_GET,
            PERMISSIONS.BOARDS_ADD,
            PERMISSIONS.BOARDS_DELETE,
            PERMISSIONS.BOARDS_UPDATE,
            PERMISSIONS.BOARDS_CLOSE,
            PERMISSIONS.BOARDS_OPEN,
            //
            // LISTS
            PERMISSIONS.LISTS_GET_ALL,
            PERMISSIONS.LISTS_GET,
            PERMISSIONS.LISTS_ADD,
            PERMISSIONS.LISTS_DELETE,
            PERMISSIONS.LISTS_UPDATE,
            PERMISSIONS.LISTS_CLOSE,
            PERMISSIONS.LISTS_OPEN,
            //
            // USERS
            PERMISSIONS.USERS_GET_ALL_AVAILABLE_USER_ROLES
        ]
    }
];

function getToken(headers) {
    if (
        headers &&
        headers.authorization &&
        headers.authorization.includes("JWT ")
    ) {
        let parted = headers.authorization.split(" ");
        if (parted.length === 2) {
            return parted[1];
        } else {
            return null;
        }
    } else {
        return null;
    }
}

function getExpirationDate() {
    let now = new Date();
    now.setMinutes(now.getMinutes() + Config.authToken.expiresInMinutes);
    return now;
}

function validateToken(req, skipRejectionOnArchivedUsers = false) {
    return (
        (function basicTokenValidation(req) {
            let token = getToken(req.headers);

            // Local function to verify if the token is expired
            function isTokenExpired(decodedToken) {
                if (!Config.authToken.expirable) {
                    return false;
                } else {
                    return new Date() <= Date.parse(decodedToken.expires)
                        ? false
                        : true;
                }
            }

            return new Promise((resolve, reject) => {
                // Ok, now let's verify the token
                if (!token) {
                    reject(ResponseMessages.tokenIsNotProvided());
                    return;
                }

                try {
                    let decoded = jwt.decode(token, Config.passwordSecret);

                    if (isTokenExpired(decoded)) {
                        let tokenExpires = new Date(decoded.expires);
                        reject(ResponseMessages.tokenIsExpired(tokenExpires));
                        return;
                    }

                    resolve({
                        _id: decoded._id,
                        email: decoded.email,
                        expires: decoded.expires
                    });
                } catch (err) {
                    reject(ResponseMessages.tokenIsNotValid());
                }
            });
        })(req)
            // End of Basic validation
            // Now let's verify if that user exists in the DB
            .then(token => {
                return new Promise((resolve, reject) => {
                    User.findOne(
                        {
                            email: token.email
                        },
                        function(err, user) {
                            if (!user || err) {
                                return reject(
                                    ResponseMessages.authenticationFailed(
                                        `user ${token.email} not found`
                                    )
                                );
                            }

                            if (!skipRejectionOnArchivedUsers) {
                                if (!user.isActive) {
                                    return reject(
                                        ResponseMessages.authenticationFailed(
                                            `user ${token.email} is archived`
                                        )
                                    );
                                }
                            }

                            resolve({
                                _id: user._id,
                                firstName: user.firstName,
                                lastName: user.lastName,
                                email: user.email,
                                roles: user.roles,
                                isActive: user.isActive
                            });
                        }
                    );
                });
            })
            .then(user => {
                return new Promise(resolve => {
                    //TODO: lookup company and adjust user to return - user.company._id, user.company.name
                    resolve(user);
                });
            })
    );
}

function getAllRolesIncludingInherited(userRole) {
    let i,
        allRoles = [],
        roleInPermissionsTree;

    roleInPermissionsTree = PERMISSIONS_BY_ROLES.find(element => {
        return element.role === userRole;
    });

    if (roleInPermissionsTree) {
        allRoles.push(roleInPermissionsTree.role);

        if (
            roleInPermissionsTree.inherits &&
            roleInPermissionsTree.inherits.length > 0
        ) {
            for (i = 0; i < roleInPermissionsTree.inherits.length; i++) {
                allRoles = allRoles.concat(
                    getAllRolesIncludingInherited(
                        roleInPermissionsTree.inherits[i]
                    )
                );
            }
        }
    }

    return allRoles;
}

function getAllUserRolesIncludingInherited(user) {
    return new Promise((resolve, reject) => {
        if (!user || !user.roles) {
            return reject(
                ResponseMessages.argumentShouldNotBeEmpty(user.roles)
            );
        }

        let i,
            j,
            allRoles = [],
            inheritedRoles;

        for (i = 0; i < user.roles.length; i++) {
            inheritedRoles = getAllRolesIncludingInherited(user.roles[i]);
            for (j = 0; j < inheritedRoles.length; j++) {
                if (!allRoles.includes(inheritedRoles[j])) {
                    allRoles.push(inheritedRoles[j]);
                }
            }
        }

        return resolve(allRoles);
    });
}

function getAllUserPermissions(options) {
    const req = options.request;
    const skipRejectionOnArchivedUsers =
        options.skipRejectionOnArchivedUsers || false;
    let i,
        j,
        rolePermissions,
        userPermissions = [];

    return new Promise((resolve, reject) => {
        validateToken(req, skipRejectionOnArchivedUsers)
            .then(user => {
                // First let's collect all the roles
                return getAllUserRolesIncludingInherited(user);
            })
            .then(allRoles => {
                // Now we can collect permissions
                for (i = 0; i < allRoles.length; i++) {
                    rolePermissions = PERMISSIONS_BY_ROLES.find(element => {
                        return element.role === allRoles[i];
                    }).permissions;
                    for (j = 0; j < rolePermissions.length; j++) {
                        if (!userPermissions.includes(rolePermissions[j])) {
                            userPermissions.push(rolePermissions[j]);
                        }
                    }
                }

                resolve(userPermissions);
            })
            .catch(err => {
                reject(err);
            });
    });
}

function validateSecurity(
    req,
    requestedPermissions,
    skipRejectionOnArchivedUsers = false
) {
    return validateToken(req, skipRejectionOnArchivedUsers).then(user => {
        return new Promise((resolve, reject) => {
            // If no permissions were put (null || undefined || empty array) then access is granted
            if (
                !requestedPermissions ||
                (Array.isArray(requestedPermissions) &&
                    requestedPermissions.length === 0)
            ) {
                resolve(user);
                return;
            }

            // Then if requested permissions is not in the array, then, just access is NOT granted
            if (!Array.isArray(requestedPermissions)) {
                reject(
                    ResponseMessages.argumentShouldHaveAnotherType(
                        "requestedPermissions",
                        "array"
                    )
                );
                return;
            }

            getAllUserPermissions({
                request: req,
                skipRejectionOnArchivedUsers
            })
                .then(userPermissions => {
                    // Now we checked that it's an array and it's not empty. Let's check if the user has the requested permission
                    // Let's check each requested permission
                    for (let i = 0; i < requestedPermissions.length; i++) {
                        if (
                            !userPermissions.includes(requestedPermissions[i])
                        ) {
                            // if requested permission is not found in user roles, then the whole permission security check fails
                            return reject(
                                ResponseMessages.permissionDenied(
                                    requestedPermissions[i]
                                )
                            );
                        }
                    }

                    // If each requested permission was granted, then the whole permission security check passes
                    resolve(user);
                })
                .catch(err => {
                    return reject(err);
                });
        });
    });
}

module.exports = function(userModel, config, responseMessages) {
    User = userModel;
    Config = config;
    ResponseMessages = responseMessages;
    return {
        getExpirationDate: getExpirationDate,
        validateToken: validateToken,
        validateSecurity: validateSecurity,
        getAllUserPermissions: getAllUserPermissions,
        ROLES: ROLES,
        PERMISSIONS: PERMISSIONS
    };
};
