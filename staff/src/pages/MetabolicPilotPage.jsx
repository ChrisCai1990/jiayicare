import React from 'react'
import Console from '../../../admin/src/pages/MetabolicPilotPage'
import { metabolicPilotAPI } from '../api'
export default function MetabolicPilotPage() { return <Console api={metabolicPilotAPI} staffMode /> }
