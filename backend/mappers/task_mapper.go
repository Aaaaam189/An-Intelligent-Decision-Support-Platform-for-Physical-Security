package mappers

import (
	"internship-go/dto"
	"internship-go/models"
)

func ToTaskResponse(task models.Task) dto.TaskResponse {

	return dto.TaskResponse{
		ID:     task.ID,
		Title:  task.Title,
		Status: task.Status,
	}
}

func ToTaskResponseList(tasks []models.Task) []dto.TaskResponse {

	var res []dto.TaskResponse

	for _, t := range tasks {
		res = append(res, ToTaskResponse(t))
	}

	return res
}