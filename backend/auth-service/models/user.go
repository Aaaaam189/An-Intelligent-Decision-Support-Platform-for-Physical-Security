package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AppRole string

const (
	RoleAdmin         AppRole = "ADMIN"
	RoleSecurityGuard AppRole = "SECURITY_GUARD"
)

type User struct {
	ID              uuid.UUID  `gorm:"type:char(36);primaryKey" json:"id"`
	FullName        string     `gorm:"size:150;not null" json:"fullName"`
	Email           string     `gorm:"uniqueIndex;size:150;not null" json:"email"`
	PasswordHash    string     `gorm:"not null" json:"-"`
	Role            AppRole    `gorm:"type:varchar(30);not null" json:"role"`
	IsActive        bool       `gorm:"not null;default:true" json:"isActive"`
	ReactivateAt    *time.Time `json:"reactivateAt"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}