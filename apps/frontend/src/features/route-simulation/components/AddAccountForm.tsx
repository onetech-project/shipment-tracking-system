'use client'

import React, { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { newId } from '../utils/id'
import { FIELD, TabProps } from './ui'

// Any name may become an account; vendors seen in the data that are not accounts yet are offered
// as suggestions. Used by tab 1 and tab 9. The reducer refuses an empty or duplicate name.
export function AddAccountForm({ source, sim, dispatch }: TabProps) {
  const listId = useId()
  const [text, setText] = useState('')
  const unused = source.vendors.filter((v) => !sim.accounts.some((a) => a.id === v.vendor))
  const add = () => {
    const name = text.trim()
    dispatch({ type: 'acctAdd', vendor: name, trancheId: newId(name || 'akun') })
    if (name && !sim.accounts.some((a) => a.id === name)) setText('')
  }
  return (
    <div className="flex gap-2">
      <input
        aria-label="Nama vendor untuk akun baru"
        list={listId}
        placeholder="Pilih atau ketik vendor"
        autoComplete="off"
        className={FIELD}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') add() }}
      />
      <datalist id={listId}>{unused.map((v) => <option key={v.vendor} value={v.vendor} />)}</datalist>
      <Button size="sm" onClick={add}>+ Tambah Akun</Button>
    </div>
  )
}
