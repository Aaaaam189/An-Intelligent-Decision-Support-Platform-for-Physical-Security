package services

import (
	"errors"

	"gorm.io/gorm"

	"sentinelai/auth-service/dto"
	"sentinelai/auth-service/models"
	"sentinelai/auth-service/utils"
)

type UserService struct {
	DB *gorm.DB
}

func NewUserService(db *gorm.DB) *UserService {
	return &UserService{DB: db}
}

func (s *UserService) CreateUser(req dto.CreateUserRequest) (*models.User, error) {
	hashedPassword, err := utils.HashPassword(req.Password)
	if err != nil {
		return nil, errors.New("failed to hash password")
	}

	user := models.User{
		FullName:     req.FullName,
		Email:        req.Email,
		PasswordHash: hashedPassword,
		Role:         req.Role,
	}

	if err := s.DB.Create(&user).Error; err != nil {
		return nil, errors.New("email already in use")
	}

	return &user, nil
}

func (s *UserService) DeleteUser(userID string) error {
	result := s.DB.Delete(&models.User{}, "id = ?", userID)
	if result.RowsAffected == 0 {
		return errors.New("user not found")
	}
	return result.Error
}