'use client'

import { CheckCircle2, Circle, Plus, Trash2, Calendar } from 'lucide-react'
import { useState } from 'react'
import { Header } from '@/components/dashboard/Header'

interface Task {
  id: number
  title: string
  description?: string
  dueDate: string
  status: 'completed' | 'pending' | 'overdue'
  priority: 'low' | 'medium' | 'high'
  event?: string
}

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: 1,
      title: 'Confirm logistics with venue manager',
      description: 'Email Klaus Mueller at Tresor Club',
      dueDate: '2026-04-10',
      status: 'pending',
      priority: 'high',
      event: 'Electric Nights Festival',
    },
    {
      id: 2,
      title: 'Prepare technical rider',
      dueDate: '2026-04-08',
      status: 'completed',
      priority: 'high',
      event: 'Electric Nights Festival',
    },
    {
      id: 3,
      title: 'Finalize playlist',
      dueDate: '2026-04-13',
      status: 'pending',
      priority: 'medium',
      event: 'Electric Nights Festival',
    },
    {
      id: 4,
      title: 'Book accommodation',
      dueDate: '2026-03-25',
      status: 'overdue',
      priority: 'high',
      event: 'Electric Nights Festival',
    },
    {
      id: 5,
      title: 'Test equipment setup',
      dueDate: '2026-04-14',
      status: 'pending',
      priority: 'medium',
    },
  ])

  const toggleTask = (id: number) => {
    setTasks(tasks.map(t =>
      t.id === id
        ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' }
        : t
    ))
  }

  const deleteTask = (id: number) => {
    setTasks(tasks.filter(t => t.id !== id))
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-900/30 text-red-400'
      case 'medium':
        return 'bg-yellow-900/30 text-yellow-400'
      case 'low':
        return 'bg-green-900/30 text-green-400'
      default:
        return ''
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400'
      case 'pending':
        return 'text-night-dark-gray'
      case 'overdue':
        return 'text-red-400'
      default:
        return ''
    }
  }

  const completedCount = tasks.filter(t => t.status === 'completed').length

  return (
    <div className="min-h-screen bg-night-black">
      <Header title="TASKS" subtitle="Preparation checklist for upcoming performances" />

      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          {/* Summary */}
          <div className="mb-8 flex gap-4">
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-4 flex-1">
              <p className="text-night-dark-gray text-sm mb-1">Total Tasks</p>
              <p className="text-2xl font-bold text-night-silver">{tasks.length}</p>
            </div>
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-4 flex-1">
              <p className="text-night-dark-gray text-sm mb-1">Completed</p>
              <p className="text-2xl font-bold text-green-400">{completedCount}</p>
            </div>
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-4 flex-1">
              <p className="text-night-dark-gray text-sm mb-1">Progress</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-night-dark-gray rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-400 transition-all"
                    style={{ width: `${(completedCount / tasks.length) * 100}%` }}
                  ></div>
                </div>
                <span className="text-lg font-bold text-night-silver">{Math.round((completedCount / tasks.length) * 100)}%</span>
              </div>
            </div>
          </div>

          {/* Add Task Button */}
          <button className="mb-8 flex items-center gap-2 px-6 py-3 bg-night-silver text-night-black rounded-lg font-semibold hover:bg-night-light transition-colors">
            <Plus className="w-5 h-5" />
            Add Task
          </button>

          {/* Tasks List */}
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`border border-night-dark-gray rounded-lg p-4 transition-all ${
                  task.status === 'completed'
                    ? 'bg-night-dark-gray/50 opacity-75'
                    : 'bg-night-gray hover:bg-night-dark-gray'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleTask(task.id)}
                    className="mt-1 flex-shrink-0 transition-colors"
                  >
                    {task.status === 'completed' ? (
                      <CheckCircle2 className={`w-5 h-5 ${getStatusColor(task.status)}`} />
                    ) : (
                      <Circle className={`w-5 h-5 ${getStatusColor(task.status)}`} />
                    )}
                  </button>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className={`font-semibold ${
                        task.status === 'completed'
                          ? 'text-night-dark-gray line-through'
                          : 'text-night-light'
                      }`}
                    >
                      {task.title}
                    </h3>
                    {task.description && (
                      <p className="text-night-dark-gray text-sm mt-1">{task.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      {task.event && (
                        <span className="text-xs bg-night-dark-gray text-night-dark-gray px-2 py-1 rounded">
                          {task.event}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-1 rounded font-semibold ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-night-dark-gray">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(task.dueDate).toLocaleDateString('en-GB')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="mt-1 flex-shrink-0 text-night-dark-gray hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
