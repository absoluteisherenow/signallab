'use client'

import { Save, User, Building, Lock, Bell, Palette } from 'lucide-react'
import { useState } from 'react'
import { Header } from '@/components/dashboard/Header'

export function SettingsPage() {
  const [settings, setSettings] = useState({
    artistName: 'Night Manoeuvres',
    email: 'contact@nightmanoeuvres.com',
    phone: '+49 30 1234 5678',
    currency: 'EUR',
    language: 'en',
    defaultFee: 2500,
    notificationsEmail: true,
    notificationsSms: false,
  })

  const handleChange = (field: string, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="min-h-screen bg-night-black">
      <Header title="SETTINGS" subtitle="Manage your profile and preferences" />

      <div className="p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Profile Section */}
          <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
            <h3 className="text-lg font-semibold text-night-silver mb-6 flex items-center gap-2">
              <User className="w-5 h-5" />
              Profile
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-night-dark-gray text-sm mb-2 font-semibold">Artist Name</label>
                <input
                  type="text"
                  value={settings.artistName}
                  onChange={(e) => handleChange('artistName', e.target.value)}
                  className="w-full bg-night-dark-gray border border-night-dark-gray text-night-light px-4 py-2 rounded focus:outline-none focus:border-night-silver transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-night-dark-gray text-sm mb-2 font-semibold">Email</label>
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="w-full bg-night-dark-gray border border-night-dark-gray text-night-light px-4 py-2 rounded focus:outline-none focus:border-night-silver transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-night-dark-gray text-sm mb-2 font-semibold">Phone</label>
                  <input
                    type="tel"
                    value={settings.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="w-full bg-night-dark-gray border border-night-dark-gray text-night-light px-4 py-2 rounded focus:outline-none focus:border-night-silver transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Business Settings */}
          <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
            <h3 className="text-lg font-semibold text-night-silver mb-6 flex items-center gap-2">
              <Building className="w-5 h-5" />
              Business
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-night-dark-gray text-sm mb-2 font-semibold">Default Currency</label>
                  <select
                    value={settings.currency}
                    onChange={(e) => handleChange('currency', e.target.value)}
                    className="w-full bg-night-dark-gray border border-night-dark-gray text-night-light px-4 py-2 rounded focus:outline-none focus:border-night-silver transition-colors"
                  >
                    <option>EUR</option>
                    <option>USD</option>
                    <option>GBP</option>
                    <option>CHF</option>
                  </select>
                </div>
                <div>
                  <label className="block text-night-dark-gray text-sm mb-2 font-semibold">Default Fee (€)</label>
                  <input
                    type="number"
                    value={settings.defaultFee}
                    onChange={(e) => handleChange('defaultFee', e.target.value)}
                    className="w-full bg-night-dark-gray border border-night-dark-gray text-night-light px-4 py-2 rounded focus:outline-none focus:border-night-silver transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
            <h3 className="text-lg font-semibold text-night-silver mb-6 flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications
            </h3>

            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer hover:bg-night-dark-gray/50 p-3 rounded transition-colors">
                <input
                  type="checkbox"
                  checked={settings.notificationsEmail}
                  onChange={(e) => handleChange('notificationsEmail', e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-night-light">Email notifications for new bookings</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer hover:bg-night-dark-gray/50 p-3 rounded transition-colors">
                <input
                  type="checkbox"
                  checked={settings.notificationsSms}
                  onChange={(e) => handleChange('notificationsSms', e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-night-light">SMS reminders for upcoming events</span>
              </label>
            </div>
          </div>

          {/* Preferences */}
          <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
            <h3 className="text-lg font-semibold text-night-silver mb-6 flex items-center gap-2">
              <Palette className="w-5 h-5" />
              Preferences
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-night-dark-gray text-sm mb-2 font-semibold">Language</label>
                <select
                  value={settings.language}
                  onChange={(e) => handleChange('language', e.target.value)}
                  className="w-full bg-night-dark-gray border border-night-dark-gray text-night-light px-4 py-2 rounded focus:outline-none focus:border-night-silver transition-colors"
                >
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="fr">Français</option>
                </select>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
            <h3 className="text-lg font-semibold text-night-silver mb-6 flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Security
            </h3>

            <button className="px-6 py-2 bg-night-dark-gray text-night-silver rounded hover:bg-night-dark-gray/70 transition-colors text-sm font-semibold">
              Change Password
            </button>
          </div>

          {/* Save Button */}
          <button className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-night-silver text-night-black rounded-lg font-semibold hover:bg-night-light transition-colors">
            <Save className="w-5 h-5" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
