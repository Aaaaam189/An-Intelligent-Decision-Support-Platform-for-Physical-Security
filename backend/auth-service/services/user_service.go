package services

import (
	"errors"
	"time"

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

func (s *UserService) GetAllUsers() ([]models.User, error) {
	var users []models.User
	if err := s.DB.Find(&users).Error; err != nil {
		return nil, errors.New("failed to fetch users")
	}
	return users, nil
}

func (s *UserService) GetUserByID(id string) (*models.User, error) {
	var user models.User
	if err := s.DB.Where("id = ?", id).First(&user).Error; err != nil {
		return nil, errors.New("user not found")
	}
	return &user, nil
}

func (s *UserService) UpdateUser(id string, req dto.UpdateUserRequest) (*models.User, error) {
	var user models.User
	if err := s.DB.Where("id = ?", id).First(&user).Error; err != nil {
		return nil, errors.New("user not found")
	}

	if req.FullName != nil {
		user.FullName = *req.FullName
	}
	if req.Role != nil {
		user.Role = *req.Role
	}
	if req.IsActive != nil {
		user.IsActive = *req.IsActive
	}

	if err := s.DB.Save(&user).Error; err != nil {
		return nil, errors.New("failed to update user")
	}
	return &user, nil
}

func (s *UserService) GetActiveUsers() ([]models.User, error) {
	var users []models.User
	if err := s.DB.Where("is_active = ?", true).Find(&users).Error; err != nil {
		return nil, errors.New("failed to fetch users")
	}
	return users, nil
}

func (s *UserService) GetInactiveUsers() ([]models.User, error) {
	var users []models.User
	if err := s.DB.Where("is_active = ?", false).Find(&users).Error; err != nil {
		return nil, errors.New("failed to fetch users")
	}
	return users, nil
}

func (s *UserService) DeactivateUser(id string, req dto.DeactivateUserRequest) (*models.User, error) {
	var user models.User
	if err := s.DB.Where("id = ?", id).First(&user).Error; err != nil {
		return nil, errors.New("user not found")
	}

	if req.ReactivateAt != nil && !req.ReactivateAt.After(time.Now()) {
		return nil, errors.New("reactivateAt must be in the future")
	}

	user.IsActive = false
	user.ReactivateAt = req.ReactivateAt

	if err := s.DB.Save(&user).Error; err != nil {
		return nil, errors.New("failed to deactivate user")
	}
	return &user, nil
}

func (s *UserService) ReactivateUser(id string) (*models.User, error) {
	var user models.User
	if err := s.DB.Where("id = ?", id).First(&user).Error; err != nil {
		return nil, errors.New("user not found")
	}

	user.IsActive = true
	user.ReactivateAt = nil // clear it — no longer relevant once active again

	if err := s.DB.Save(&user).Error; err != nil {
		return nil, errors.New("failed to reactivate user")
	}
	return &user, nil
}