package repositories

import (
	"database/sql"
	"internship-go/models"
)

type TaskRepository struct {
	db *sql.DB
}

func NewTaskRepository(db *sql.DB) *TaskRepository {
	return &TaskRepository{db: db}
}

func (r *TaskRepository) FindAll() ([]models.Task, error) {

	rows, err := r.db.Query("SELECT id, title, status, user_id FROM tasks")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []models.Task

	for rows.Next() {

		var t models.Task

		rows.Scan(&t.ID, &t.Title, &t.Status, &t.UserID)

		tasks = append(tasks, t)
	}

	return tasks, nil
}