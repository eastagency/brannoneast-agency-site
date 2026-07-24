// Converts our domain object into the exact 121 ACORD 25 field names.
// Keeping this separate from extraction/fill means the field-name mapping
// is one reviewable place, not scattered through prompt code or fill code.

// Only assigns when `value` is truthy. This matters when "policies" has more
// than one entry for the same line of business (which shouldn't happen, but
// extraction is a model call, not a guarantee) — a later blank/missing field
// must never silently blank out an earlier real value.
function set(f, key, value) {
  if (value) f[key] = value;
}

function mapToAcordFields(data) {
  const f = {};

  const addr = (prefix, a) => {
    if (!a) return;
    set(f, `${prefix}_MailingAddress_LineOne_A`, a.addressLine1);
    set(f, `${prefix}_MailingAddress_LineTwo_A`, a.addressLine2);
    set(f, `${prefix}_MailingAddress_CityName_A`, a.city);
    set(f, `${prefix}_MailingAddress_StateOrProvinceCode_A`, a.state);
    set(f, `${prefix}_MailingAddress_PostalCode_A`, a.postalCode);
  };

  if (data.producer) {
    set(f, 'Producer_FullName_A', data.producer.fullName);
    addr('Producer', data.producer);
    set(f, 'Producer_ContactPerson_FullName_A', data.producer.contactName);
    set(f, 'Producer_ContactPerson_PhoneNumber_A', data.producer.phone);
    set(f, 'Producer_FaxNumber_A', data.producer.fax);
    set(f, 'Producer_ContactPerson_EmailAddress_A', data.producer.email);
  }

  if (data.namedInsured) {
    set(f, 'NamedInsured_FullName_A', data.namedInsured.fullName);
    addr('NamedInsured', data.namedInsured);
  }

  if (data.certificateHolder) {
    set(f, 'CertificateHolder_FullName_A', data.certificateHolder.fullName);
    addr('CertificateHolder', data.certificateHolder);
  }

  set(f, 'CertificateOfInsurance_CertificateNumberIdentifier_A', data.certificateNumber);
  set(f, 'CertificateOfInsurance_RevisionNumberIdentifier_A', data.revisionNumber);
  set(f, 'Form_CompletionDate_A', data.formCompletionDate);
  set(f, 'CertificateOfLiabilityInsurance_ACORDForm_RemarkText_A', data.descriptionOfOperations);

  for (const ins of data.insurers || []) {
    const L = ins.letter;
    set(f, `Insurer_FullName_${L}`, ins.fullName);
    set(f, `Insurer_NAICCode_${L}`, ins.naic);
  }

  const seenLines = new Set();

  for (const p of data.policies || []) {
    const L = p.letter;
    const lineKey = `${L}:${p.lineOfBusiness}`;
    if (seenLines.has(lineKey)) {
      console.warn(`map-to-acord: duplicate ${p.lineOfBusiness} entry for letter ${L} — ignoring the later one to avoid overwriting real data with blanks`);
      continue;
    }
    seenLines.add(lineKey);

    if (p.lineOfBusiness === 'generalLiability') {
      set(f, 'GeneralLiability_InsurerLetterCode_A', L);
      f.GeneralLiability_CoverageIndicator_A = true;
      if (p.occurrenceForm) f.GeneralLiability_OccurrenceIndicator_A = true;
      if (p.claimsMadeForm) f.GeneralLiability_ClaimsMadeIndicator_A = true;
      set(f, 'Policy_PolicyNumberIdentifier_A', p.policyNumber);
      set(f, 'Policy_EffectiveDate_A', p.effectiveDate);
      set(f, 'Policy_ExpirationDate_A', p.expirationDate);
      set(f, 'GeneralLiability_EachOccurrence_LimitAmount_A', p.eachOccurrence);
      set(f, 'GeneralLiability_FireDamageRentedPremises_EachOccurrenceLimitAmount_A', p.damageToRentedPremises);
      set(f, 'GeneralLiability_MedicalExpense_EachPersonLimitAmount_A', p.medExpense);
      set(f, 'GeneralLiability_PersonalAndAdvertisingInjury_LimitAmount_A', p.personalAdvertisingInjury);
      set(f, 'GeneralLiability_GeneralAggregate_LimitAmount_A', p.generalAggregate);
      set(f, 'GeneralLiability_ProductsAndCompletedOperations_AggregateLimitAmount_A', p.productsCompletedOpsAggregate);
      if (p.aggregateAppliesPer === 'policy') f.GeneralLiability_GeneralAggregate_LimitAppliesPerPolicyIndicator_A = true;
      if (p.aggregateAppliesPer === 'project') f.GeneralLiability_GeneralAggregate_LimitAppliesPerProjectIndicator_A = true;
      if (p.aggregateAppliesPer === 'location') f.GeneralLiability_GeneralAggregate_LimitAppliesPerLocationIndicator_A = true;
      if (p.additionalInsured) f.CertificateOfInsurance_AdditionalInsuredCode_A = 'Y';
      if (p.subrogationWaived) f.Policy_SubrogationWaivedCode_A = 'Y';
    }

    if (p.lineOfBusiness === 'automobile') {
      set(f, 'Vehicle_InsurerLetterCode_A', L);
      if (p.anyAuto) f.Vehicle_AnyAutoIndicator_A = true;
      if (p.ownedAutos) f.Vehicle_AllOwnedAutosIndicator_A = true;
      if (p.scheduledAutos) f.Vehicle_ScheduledAutosIndicator_A = true;
      if (p.hiredAutos) f.Vehicle_HiredAutosIndicator_A = true;
      if (p.nonOwnedAutos) f.Vehicle_NonOwnedAutosIndicator_A = true;
      set(f, 'Policy_PolicyNumberIdentifier_B', p.policyNumber);
      set(f, 'Policy_EffectiveDate_B', p.effectiveDate);
      set(f, 'Policy_ExpirationDate_B', p.expirationDate);
      set(f, 'Vehicle_CombinedSingleLimit_EachAccidentAmount_A', p.combinedSingleLimit);
      set(f, 'Vehicle_BodilyInjury_PerPersonLimitAmount_A', p.bodilyInjuryPerPerson);
      set(f, 'Vehicle_BodilyInjury_PerAccidentLimitAmount_A', p.bodilyInjuryPerAccident);
      set(f, 'Vehicle_PropertyDamage_PerAccidentLimitAmount_A', p.propertyDamage);
      if (p.additionalInsured) f.CertificateOfInsurance_AdditionalInsuredCode_B = 'Y';
      if (p.subrogationWaived) f.Policy_SubrogationWaivedCode_B = 'Y';
    }

    if (p.lineOfBusiness === 'umbrella' || p.lineOfBusiness === 'excess') {
      set(f, 'ExcessUmbrella_InsurerLetterCode_A', L);
      if (p.lineOfBusiness === 'umbrella') f.Policy_PolicyType_UmbrellaIndicator_A = true;
      if (p.lineOfBusiness === 'excess') f.Policy_PolicyType_ExcessIndicator_A = true;
      if (p.occurrenceForm) f.ExcessUmbrella_OccurrenceIndicator_A = true;
      if (p.claimsMadeForm) f.ExcessUmbrella_ClaimsMadeIndicator_A = true;
      set(f, 'Policy_PolicyNumberIdentifier_D', p.policyNumber);
      set(f, 'Policy_EffectiveDate_D', p.effectiveDate);
      set(f, 'Policy_ExpirationDate_D', p.expirationDate);
      set(f, 'ExcessUmbrella_Umbrella_EachOccurrenceAmount_A', p.eachOccurrence);
      set(f, 'ExcessUmbrella_Umbrella_AggregateAmount_A', p.aggregate);
      if (p.deductibleOrRetention) {
        f.ExcessUmbrella_DeductibleIndicator_A = p.deductibleType === 'deductible';
        f.ExcessUmbrella_RetentionIndicator_A = p.deductibleType === 'retention';
        set(f, 'ExcessUmbrella_Umbrella_DeductibleOrRetentionAmount_A', p.deductibleOrRetention);
      }
      if (p.subrogationWaived) f.Policy_SubrogationWaivedCode_D = 'Y';
    }

    if (p.lineOfBusiness === 'workersComp') {
      set(f, 'WorkersCompensationEmployersLiability_InsurerLetterCode_A', L);
      if (p.statutoryLimits) f.WorkersCompensationEmployersLiability_WorkersCompensationStatutoryLimitIndicator_A = true;
      set(f, 'Policy_PolicyNumberIdentifier_E', p.policyNumber);
      set(f, 'Policy_EffectiveDate_E', p.effectiveDate);
      set(f, 'Policy_ExpirationDate_E', p.expirationDate);
      set(f, 'WorkersCompensationEmployersLiability_EmployersLiability_EachAccidentLimitAmount_A', p.eachAccident);
      set(f, 'WorkersCompensationEmployersLiability_EmployersLiability_DiseaseEachEmployeeLimitAmount_A', p.diseaseEachEmployee);
      set(f, 'WorkersCompensationEmployersLiability_EmployersLiability_DiseasePolicyLimitAmount_A', p.diseasePolicyLimit);
      if (p.subrogationWaived) f.Policy_SubrogationWaivedCode_E = 'Y';
    }
  }

  return f;
}

module.exports = { mapToAcordFields };
