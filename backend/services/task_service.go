package services

import (
	"internship-go/mappers"
	"internship-go/repositories"
	"internship-go/dto"
)

type TaskService struct {
	repo *repositories.TaskRepository
}

func NewTaskService(repo *repositories.TaskRepository) *TaskService {
	return &TaskService{repo: repo}
}

func (s *TaskService) GetAllTasks() ([]dto.TaskResponse, error) {

	tasks, err := s.repo.FindAll()

	if err != nil {
		return nil, err
	}

	return mappers.ToTaskResponseList(tasks), nil
}