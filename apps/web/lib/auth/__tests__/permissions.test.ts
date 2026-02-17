import { describe, it, expect } from 'vitest'
import {
  hasMinimumRole,
  hasRole,
  canManageAccountSettings,
  canManageUsers,
  canManageClients,
  canCreateJobs,
  canAssignTechs,
  canCreateEstimates,
  canRecordPayments,
  canViewAuditLog,
  canDeleteRecords,
} from '../permissions'

describe('hasMinimumRole', () => {
  it('owner meets owner requirement', () => {
    expect(hasMinimumRole('owner', 'owner')).toBe(true)
  })
  it('owner meets admin requirement', () => {
    expect(hasMinimumRole('owner', 'admin')).toBe(true)
  })
  it('owner meets tech requirement', () => {
    expect(hasMinimumRole('owner', 'tech')).toBe(true)
  })
  it('admin does not meet owner requirement', () => {
    expect(hasMinimumRole('admin', 'owner')).toBe(false)
  })
  it('admin meets admin requirement', () => {
    expect(hasMinimumRole('admin', 'admin')).toBe(true)
  })
  it('tech does not meet admin requirement', () => {
    expect(hasMinimumRole('tech', 'admin')).toBe(false)
  })
  it('tech does not meet owner requirement', () => {
    expect(hasMinimumRole('tech', 'owner')).toBe(false)
  })
})

describe('hasRole', () => {
  it('returns true when role is in allowed list', () => {
    expect(hasRole('admin', ['owner', 'admin'])).toBe(true)
  })
  it('returns false when role is not in allowed list', () => {
    expect(hasRole('tech', ['owner', 'admin'])).toBe(false)
  })
  it('returns true for exact single match', () => {
    expect(hasRole('owner', ['owner'])).toBe(true)
  })
})

describe('permission helpers', () => {
  it('canManageAccountSettings: owner only', () => {
    expect(canManageAccountSettings('owner')).toBe(true)
    expect(canManageAccountSettings('admin')).toBe(false)
    expect(canManageAccountSettings('tech')).toBe(false)
  })

  it('canManageUsers: owner and admin', () => {
    expect(canManageUsers('owner')).toBe(true)
    expect(canManageUsers('admin')).toBe(true)
    expect(canManageUsers('tech')).toBe(false)
  })

  it('canManageClients: owner and admin', () => {
    expect(canManageClients('owner')).toBe(true)
    expect(canManageClients('admin')).toBe(true)
    expect(canManageClients('tech')).toBe(false)
  })

  it('canCreateJobs: all roles', () => {
    expect(canCreateJobs('owner')).toBe(true)
    expect(canCreateJobs('admin')).toBe(true)
    expect(canCreateJobs('tech')).toBe(true)
  })

  it('canAssignTechs: owner and admin only', () => {
    expect(canAssignTechs('owner')).toBe(true)
    expect(canAssignTechs('admin')).toBe(true)
    expect(canAssignTechs('tech')).toBe(false)
  })

  it('canCreateEstimates: owner and admin only', () => {
    expect(canCreateEstimates('owner')).toBe(true)
    expect(canCreateEstimates('admin')).toBe(true)
    expect(canCreateEstimates('tech')).toBe(false)
  })

  it('canRecordPayments: owner and admin only', () => {
    expect(canRecordPayments('owner')).toBe(true)
    expect(canRecordPayments('admin')).toBe(true)
    expect(canRecordPayments('tech')).toBe(false)
  })

  it('canViewAuditLog: owner and admin only', () => {
    expect(canViewAuditLog('owner')).toBe(true)
    expect(canViewAuditLog('admin')).toBe(true)
    expect(canViewAuditLog('tech')).toBe(false)
  })

  it('canDeleteRecords: owner only', () => {
    expect(canDeleteRecords('owner')).toBe(true)
    expect(canDeleteRecords('admin')).toBe(false)
    expect(canDeleteRecords('tech')).toBe(false)
  })
})
