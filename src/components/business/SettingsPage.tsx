'use client'

import { Save, User, Building, Lock, Bell, Palette, Mail } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Header } from '@/components/dashboard/Header'
import { PushOptIn } from '@/components/business/PushOptIn'

export function SettingsPage() {
  const [connectedAccounts, setConnectedAccounts] = useState<Array<{id: string, email: string, label: string}>>([])
  const [newAccountLabel, setNewAccountLabel] = useState('')
  const [showAddAccount, setShowAddAccount] = useState(false)

  useEffect(() => {
    fetch('/api/gmail/accounts')
      .then(res => res.json())
      .then(data => setConnectedAccounts(data.accounts || []))
      .catch(() => {})
  }, [])

  const disconnectAccountHandler = async (id: string) => {
    await fetch(`/api/gmail/accounts?id=${id}`, { method: 'DELETE' })
    setConnectedAccounts(prev => prev.filter(a => a.id !== id))
  }

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
          <div className="bg-night-gray border border-night-dark-gray rounded-none p-6">
            <h3 className="text-lg font-extrabold uppercase tracking-tight text-night-silver mb-6 flex items-center gap-2">
              <User className="w-5 h-5" />
              Profile
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-night-dark-gray text-xs mb-2 font-bold uppercase tracking-widest">Artist Name</label>
                <input
                  type="text"
                  value={settings.artistName}
                  onChange={(e) => handleChange('artistName', e.target.value)}
                  className="w-full bg-night-dark-gray border border-night-dark-gray text-night-light px-4 py-2 rounded-nonefocus:outline-none focus:border-night-silver transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-night-dark-gray text-xs mb-2 font-bold uppercase tracking-widest">Email</label>
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="w-full bg-night-dark-gray border border-night-dark-gray text-night-light px-4 py-2 rounded-nonefocus:outline-none focus:border-night-silver transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-night-dark-gray text-xs mb-2 font-bold uppercase tracking-widest">Phone</label>
                  <input
                    type="tel"
                    value={settings.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="w-full bg-night-dark-gray border border-night-dark-gray text-night-light px-4 py-2 rounded-nonefocus:outline-none focus:border-night-silver transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Business Settings */}
          <div className="bg-night-gray border border-night-dark-gray rounded-none p-6">
            <h3 className="text-lg font-extrabold uppercase tracking-tight text-night-silver mb-6 flex items-center gap-2">
              <Building className="w-5 h-5" />
              Business
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-night-dark-gray text-xs mb-2 font-bold uppercase tracking-widest">Default Currency</label>
                  <select
                    value={settings.currency}
                    onChange={(e) => handleChange('currency', e.target.value)}
                    className="w-full bg-night-dark-gray border border-night-dark-gray text-night-light px-4 py-2 rounded-nonefocus:outline-none focus:border-night-silver transition-colors"
                  >
                    <option>EUR</option>
                    <option>USD</option>
                    <option>GBP</option>
                    <option>CHF</option>
                  </select>
                </div>
                <div>
                  <label className="block text-night-dark-gray text-xs mb-2 font-bold uppercase tracking-widest">Default Fee (€)</label>
                  <input
                    type="number"
                    value={settings.defaultFee}
                    onChange={(e) => handleChange('defaultFee', e.target.value)}
                    className="w-full bg-night-dark-gray border border-night-dark-gray text-night-light px-4 py-2 rounded-nonefocus:outline-none focus:border-night-silver transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-night-gray border border-night-dark-gray rounded-none p-6">
            <h3 className="text-lg font-extrabold uppercase tracking-tight text-night-silver mb-6 flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications
            </h3>

            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer hover:bg-night-dark-gray/50 p-3 rounded-nonetransition-colors">
                <input
                  type="checkbox"
                  checked={settings.notificationsEmail}
                  onChange={(e) => handleChange('notificationsEmail', e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-night-light">Email notifications for new bookings</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer hover:bg-night-dark-gray/50 p-3 rounded-nonetransition-colors">
                <input
                  type="checkbox"
                  checked={settings.notificationsSms}
                  onChange={(e) => handleChange('notificationsSms', e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-night-light">SMS reminders for upcoming events</span>
              </label>

              {/* Browser push — enable/disable + quick test. Hidden on
                  unsupported browsers (Safari pre-PWA, incognito). */}
              <PushOptIn />
            </div>
          </div>

          {/* Preferences */}
          <div className="bg-night-gray border border-night-dark-gray rounded-none p-6">
            <h3 className="text-lg font-extrabold uppercase tracking-tight text-night-silver mb-6 flex items-center gap-2">
              <Palette className="w-5 h-5" />
              Preferences
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-night-dark-gray text-xs mb-2 font-bold uppercase tracking-widest">Language</label>
                <select
                  value={settings.language}
                  onChange={(e) => handleChange('language', e.target.value)}
                  className="w-full bg-night-dark-gray border border-night-dark-gray text-night-light px-4 py-2 rounded-nonefocus:outline-none focus:border-night-silver transition-colors"
                >
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="fr">Français</option>
                </select>
              </div>
            </div>
          </div>

          {/* Connected Email Accounts */}
          <div className="bg-night-gray border border-night-dark-gray rounded-none p-6">
            <h3 className="text-lg font-semibold text-night-silver mb-2 flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Connected Accounts
            </h3>
            <p className="text-night-dark-gray text-sm mb-6">
              All connected accounts are scanned for bookings, invoice requests, and expenses.
            </p>

            <div className="space-y-3 mb-4">
              {connectedAccounts.length === 0 && (
                <p className="text-night-dark-gray text-sm">No accounts connected yet.</p>
              )}
              {connectedAccounts.map(account => (
                <div key={account.id} className="flex items-center justify-between p-3 bg-night-dark-gray/30 border border-night-dark-gray rounded">
                  <div>
                    <div className="text-night-light text-sm font-medium">{account.email}</div>
                    <div className="text-night-dark-gray text-xs mt-0.5">{account.label}</div>
                  </div>
                  <button
                    onClick={() => disconnectAccountHandler(account.id)}
                    className="text-xs text-night-dark-gray hover:text-red-400 transition-colors border border-night-dark-gray hover:border-red-400 px-3 py-1.5 rounded"
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>

            {!showAddAccount ? (
              <button
                onClick={() => setShowAddAccount(true)}
                className="text-sm border border-night-dark-gray text-night-dark-gray hover:border-[#ff2a1a] hover:text-[#ff2a1a] transition-colors px-4 py-2 rounded"
              >
                + Connect account
              </button>
            ) : (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-night-dark-gray text-xs mb-1.5 font-semibold uppercase tracking-wider">Label</label>
                  <input
                    type="text"
                    value={newAccountLabel}
                    onChange={e => setNewAccountLabel(e.target.value)}
                    placeholder="e.g. Management, Bookings, Personal"
                    className="w-full bg-night-dark-gray border border-night-dark-gray text-night-light px-3 py-2 rounded-nonetext-sm focus:outline-none focus:border-night-silver"
                  />
                </div>
                <a
                  href={`/api/gmail/auth?label=${encodeURIComponent(newAccountLabel || 'Primary')}`}
                  className="px-4 py-2 bg-[#ff2a1a] text-[#050505] rounded-nonetext-sm font-semibold hover:bg-[#ff5040] transition-colors whitespace-nowrap"
                >
                  Connect Gmail →
                </a>
                <button onClick={() => setShowAddAccount(false)} className="text-night-dark-gray hover:text-night-light text-sm px-2 py-2">
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Security */}
          <div className="bg-night-gray border border-night-dark-gray rounded-none p-6">
            <h3 className="text-lg font-extrabold uppercase tracking-tight text-night-silver mb-6 flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Security
            </h3>

            <button className="px-6 py-2 bg-night-dark-gray text-night-silver rounded-nonehover:bg-night-dark-gray/70 transition-colors text-sm font-semibold">
              Change Password
            </button>
          </div>

          {/* Save Button */}
          <button className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-night-silver text-night-black rounded-none font-semibold hover:bg-night-light transition-colors">
            <Save className="w-5 h-5" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
