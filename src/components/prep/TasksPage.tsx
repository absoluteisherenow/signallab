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
  const [showAddModal, setShowAddModal] = useState(false)
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    dueDate: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
  })
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

  const handleAddTask = () => {
    if (!newTask.title.trim() || !newTask.dueDate) return
    const task: Task = {
      id: Math.max(...tasks.map(t => t.id), 0) + 1,
      title: newTask.title,
      description: newTask.description || undefined,
      dueDate: newTask.dueDate,
      priority: newTask.priority,
      status: 'pending',
    }
    setTasks([...tasks, task])
    setNewTask({ title: '', description: '', dueDate: '', priority: 'medium' })
    setShowAddModal(false)
  }

  return (
    <div className="min-h-screen bg-night-black">
      <Header title="TASKS" subtitle="Preparation checklist for upcoming performances" />

      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          {/* Summary */}
          <div className="mb-8 flex gap-4">
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-4 flex-1">
              <p className="text-night-dark-gray mb-1" style={{ fontSize: '12px' }}>Total Tasks</p>
              <p className="text-2xl font-bold text-night-silver">{tasks.length}</p>
            </div>
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-4 flex-1">
              <p className="text-night-dark-gray mb-1" style={{ fontSize: '12px' }}>Completed</p>
              <p className="text-2xl font-bold text-green-400">{completedCount}</p>
            </div>
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-4 flex-1">
              <p className="text-night-dark-gray mb-1" style={{ fontSize: '12px' }}>Progress</p>
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
          <button onClick={() => setShowAddModal(true)} className="mb-8 flex items-center gap-2 px-6 py-3 bg-night-silver text-night-black rounded-lg font-semibold hover:bg-night-light transition-colors">
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
                      <p className="text-night-dark-gray mt-1" style={{ fontSize: '13px' }}>{task.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      {task.event && (
                        <span className="bg-night-dark-gray text-night-dark-gray px-2 py-1 rounded" style={{ fontSize: '11px' }}>
                          {task.event}
                        </span>
                      )}
                      <span className={`px-2 py-1 rounded font-semibold ${getPriorityColor(task.priority)}`} style={{ fontSize: '11px' }}>
                        {task.priority}
                      </span>
                      <div className="flex items-center gap-1 text-night-dark-gray" style={{ fontSize: '11px' }}>
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

          {/* Add Task Modal */}
          {showAddModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold text-night-silver mb-4">Add New Task</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block font-semibold text-night-light mb-2" style={{ fontSize: '13px' }}>Task Title</label>
                    <input
                      type="text"
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      placeholder="e.g., Confirm logistics with venue"
                      className="w-full bg-night-black border border-night-dark-gray rounded px-3 py-2 text-night-light focus:outline-none focus:border-night-silver"
                    />
                  </div>
                  
                  <div>
                    <label className="block font-semibold text-night-light mb-2" style={{ fontSize: '13px' }}>Description (optional)</label>
                    <textarea
                      value={newTask.description}
                      onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                      placeholder="Add any notes or details"
                      className="w-full bg-night-black border border-night-dark-gray rounded px-3 py-2 text-night-light focus:outline-none focus:border-night-silver resize-none h-20"
                    />
                  </div>
                  
                  <div>
                    <label className="block font-semibold text-night-light mb-2" style={{ fontSize: '13px' }}>Due Date</label>
                    <input
                      type="date"
                      value={newTask.dueDate}
                      onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                      className="w-full bg-night-black border border-night-dark-gray rounded px-3 py-2 text-night-light focus:outline-none focus:border-night-silver"
                    />
                  </div>
                  
                  <div>
                    <label className="block font-semibold text-night-light mb-2" style={{ fontSize: '13px' }}>Priority</label>
                    <div className="flex gap-2">
                      {(['low', 'medium', 'high'] as const).map(p => (
                        <button
                          key={p}
                          onClick={() => setNewTask({ ...newTask, priority: p })}
                          className={`flex-1 py-2 rounded text-sm font-semibold transition-all ${
                            newTask.priority === p
                              ? 'bg-night-silver text-night-black'
                              : 'bg-night-black border border-night-dark-gray text-night-light'
                          }`}
                        >
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-2 bg-night-black border border-night-dark-gray text-night-light rounded font-semibold hover:bg-night-dark-gray transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddTask}
                    className="flex-1 px-4 py-2 bg-night-silver text-night-black rounded font-semibold hover:bg-night-light transition-colors"
                  >
                    Add Task
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
