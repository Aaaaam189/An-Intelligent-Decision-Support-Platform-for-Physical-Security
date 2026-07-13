package models

type AppRole string

const (
	RoleAdmin         AppRole = "ADMIN"
	RoleSecurityGuard AppRole = "SECURITY_GUARD"
)