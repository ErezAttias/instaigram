'use client'

import { DesignStep } from '@/components/channel/steps/DesignStep'

export default function DesignPreviewPage() {
  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-6">
      <DesignStep
        sampleTitle="Ferrari refused to sell Enzo Ferrari a car, so he built Lamborghini out of spite in 1963"
        sampleSubtitle="Ferruccio Lamborghini owned a Ferrari 250 GT but hated its clutch. When Enzo dismissed his complaint, calling him a tractor maker, Lamborghini launched his own supercar brand four months later."
        onApprove={() => {}}
        onBack={() => {}}
      />
    </div>
  )
}
