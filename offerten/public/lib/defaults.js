// CARIFY Offerten & Verträge – neutral default settings.
//
// The repository is public: no company data lives here (no address, no prices, no references,
// no contract clauses). Everything below is generic placeholder copy. The real CARIFY settings
// are imported once per browser from a private JSON file (Einstellungen → Importieren).

"use strict";

globalThis.CarifyDefaults = (function () {
  const SCHEMA = "carify-offerten/1";

  const TEXTS_DE = {
    // ---- Offerte: Deckblatt
    coverIntro:
      "Mit dem Auto-Abo nutzen Unternehmen Fahrzeuge flexibel – ohne Kapitalbindung, ohne administrativen Aufwand und mit einer fixen Monatsrate.\n\n" +
      "Versicherung, Service, Reifen, Steuern und Registrierung sind inklusive. Sie fahren, wir kümmern uns um den Rest.\n\n" +
      "So bleibt Mobilität einfach, planbar und jederzeit anpassbar.",
    coverButton: "zur Offerte",
    coverClaim: "Auto-Abo für Unternehmen",

    // ---- Offerte: Begleitbrief
    letterTitle: "Ihre Offerte",
    letterBody:
      "{{briefanrede}}\n\n" +
      "Vielen Dank für Ihr Interesse an CARIFY.\n\n" +
      "Gerne finden Sie anbei die Offerte {{zum_fahrzeug}}. Zusätzlich sind folgende Informationen in der Offerte enthalten:\n\n" +
      "{{inhalt}}\n\n" +
      "Wir freuen uns auf Ihre Rückmeldung und eine partnerschaftliche Zusammenarbeit.\n\n" +
      "Freundliche Grüsse",
    letterContactLabel: "Kontakt:",
    salutationMr: "Sehr geehrter Herr {{nachname}}",
    salutationMrs: "Sehr geehrte Frau {{nachname}}",
    salutationNone: "Sehr geehrte Damen und Herren",
    salutationWordMr: "Herr",
    salutationWordMrs: "Frau",
    vehicleSingular: "zum gewünschten Fahrzeug",
    vehiclePlural: "zu den gewünschten Fahrzeugen",

    // ---- Offerte: Warum Auto-Abo
    whyTitle: "Warum ein Firmenwagen im Abo?",
    whyLead:
      "Das Auto-Abo schliesst die Lücke zwischen kurzfristiger Miete und langfristigem Leasing oder Kauf – mit der richtigen Balance aus Kosten, Flexibilität und Laufzeit.",
    whyChart: {
      yAxis: "Kosten (CHF)",
      xAxis: "Bindung (Laufzeit)",
      items: [
        { label: "Taxi / Uber", range: "Minuten – Stunden" },
        { label: "Car Sharing", range: "Stunden – Tage" },
        { label: "Miete", range: "Tage – Wochen" },
        { label: "Auto-Abo", range: "3 Monate – 4 Jahre" },
        { label: "Leasing", range: "3 – 5 Jahre" },
        { label: "Kauf", range: "5 – 10 Jahre" },
      ],
    },
    included: [
      { title: "Versicherung", text: "Inklusive, auf Wunsch mit reduziertem Selbstbehalt." },
      { title: "24h Pannendienst", text: "Hilfe rund um die Uhr, auch im Ausland." },
      { title: "Ersatzauto", text: "Bei einem Ausfall steht schnell ein Ersatz bereit." },
      { title: "Service & Unterhalt", text: "Service, Verschleiss und Reifen sind inklusive." },
      { title: "Steuern & Registrierung", text: "Wir erledigen Einlösung und Verkehrssteuern." },
    ],
    usps: [
      { title: "Schnell einsatzbereit", text: "Fahrzeuge sind kurzfristig verfügbar und bei Bedarf rasch ersetzt." },
      { title: "Volle Kostentransparenz", text: "Eine fixe All-inclusive-Monatsrate, keine Kapitalbindung, keine versteckten Kosten." },
      { title: "Maximale Flexibilität", text: "Fahrzeuge nur so lange nutzen, wie sie wirklich gebraucht werden." },
      { title: "Minimaler Aufwand", text: "Ein Ansprechpartner für alles, kein operativer Flottenaufwand." },
    ],

    // ---- Offerte: Zusatzoptionen (optionale Seite, z. B. Flex-Paket)
    optionsTitle: "Optionen für Geschäftskunden",
    optionsIntro: "",
    options: [],

    // ---- Offerte: Preistabelle
    pricesTitle: "Offerte",
    colVehicle: "Fahrzeug",
    colTerm: "Min. Laufzeit*",
    colKm: "KM**",
    colPriceExcl: "Preis exkl. MwSt.",
    colPriceIncl: "Preis inkl. MwSt.",
    colPrice: "Preis",
    colInsurance: "Insurance Upgrade",
    insuranceNote: "Versicherung + {{betrag}}",
    privateSurchargeNote: "Bei einer Privatbuchung kommt ein Zuschlag von {{betrag}} pro Monat dazu.",
    validityNote:
      "Diese {{indikativ}}Offerte ist {{gueltig_tage}} Tage gültig (bis {{gueltig_bis}}). {{mwst_hinweis}}\n" +
      "Die Fahrzeuge werden nicht automatisch reserviert. Nach Ablauf der Gültigkeit können sich die Preise ändern.",
    indicativeWord: "indikative ",
    vatExcl: "Alle Preise exkl. MwSt.",
    vatIncl: "Alle Preise inkl. MwSt.",
    vatBoth: "Preise exkl. und inkl. {{mwst_satz}} MwSt.",
    footnoteTerm: "* Mindestlaufzeit in Monaten, danach monatlich kündbar",
    footnoteKm: "** Kilometer pro Monat",
    bestPriceTitle: "",
    bestPriceText: "",
    footerClaim: "",

    // ---- Vertrag
    contractTitle: "Auto-Abo Vertrag",
    contractNumberLabel: "Vertrag Nr.",
    contractAdjustmentSuffix: " – Anpassung",
    contractTakeoverSubtitle: "Vertragsanpassung",
    contractVehiclesIntroAdjustment: "Bezüglich folgender Fahrzeuge von CARIFY:",
    contractVehiclesIntroTakeover: "Der Abo-Nehmer übernimmt folgende Fahrzeuge:",
    contractFieldStartAdjustment: "Mindestlaufzeit bis",
    contractFieldStartTakeover: "Änderungsdatum",
    contractFieldVehicleId: "Fahrzeug-ID",
    contractEach: "je ",
    contractDownPaymentText: "Die Aborate berücksichtigt eine Anzahlung von **{{betrag}}** ({{mwst}}) und gilt während der Mindestlaufzeit.",
    contractBetween: "zwischen",
    contractCarifyAlias: "nachstehend „CARIFY“ genannt.",
    contractCustomerLabel: "Firma / jur. Person\nAnschrift",
    contractCustomerAlias: "nachstehend „Abo-Nehmer“ genannt.",
    contractCustomerNote: "",
    contractVehiclesIntro: "Der Abo-Nehmer übernimmt folgende Fahrzeuge von CARIFY:",
    contractFieldModel: "Fahrzeugmodell",
    contractFieldStart: "Geplanter Abobeginn",
    contractFieldKm: "Kilometer-Package pro Monat",
    contractFieldTerm: "Mindestlaufzeit in Monaten",
    contractFieldInsurance: "Insurance-Package",
    contractFieldPackage: "Package Type",
    contractReplacement:
      "Falls Fahrzeuge aus irgendeinem Grund nicht verfügbar sein sollten, bietet CARIFY eine angemessene Ersatzlösung an.",
    contractRateTitle: "Aborate",
    contractRateText:
      "Für die Fahrzeuge und den Service verrechnet CARIFY eine fahrzeugbezogene monatliche Gebühr. {{aborate_satz}}{{aufpreis_satz}}\n" +
      "Die Gebühr wird dem Abo-Nehmer monatlich in Rechnung gestellt und ist jeweils zum 1. Tag des Abomonats fällig.\n" +
      "{{mehrkm_satz}} Die Kündigungsfrist beträgt nach Ablauf der Mindestlaufzeit {{kuendigungsfrist}} zum jeweiligen Abomonatsende.\n" +
      "Es gelten die Allgemeinen Geschäftsbedingungen (AGB) von CARIFY.",
    contractRateOne: "Diese beträgt **{{betrag}} pro Monat** ({{mwst}}).",
    contractRateEach: "Diese beträgt je Fahrzeug **{{betrag}} pro Monat** ({{mwst}}).",
    contractRateGroups: "Diese beträgt je Fahrzeug und Monat ({{mwst}}) {{liste}}.",
    contractRateFor: "**{{betrag}}** für {{modell}}",
    contractSurchargeText: "Zuzüglich je Fahrzeug und Monat ({{mwst}}) {{liste}}.",
    contractSurchargeInsurance: "**{{betrag}}** für das Versicherungs-Upgrade",
    contractSurchargePackage: "**{{betrag}}** für das {{paket}}-Paket",
    contractExtraKmOne: "Mehrkilometer werden bei der Fahrzeugrückgabe mit **{{betrag}} pro km** ({{mwst}}) verrechnet.",
    contractExtraKmGroups: "Mehrkilometer werden bei der Fahrzeugrückgabe pro km ({{mwst}}) verrechnet: {{liste}}.",
    contractVatExcl: "exkl. MwSt",
    contractVatIncl: "inkl. MwSt",
    listAnd: " und ",
    contractSignaturesTitle: "Unterschriften",
    contractSignCarify: "CARIFY",
    contractSignCarifyRole: "Firmenvertreter",
    contractSignCustomer: "Abo-Nehmer",
    contractSignPlaceDate: "Ort, Datum",
    contractSignName: "Name, Vorname",
    contractSignSignature: "Rechtsgültige Unterschrift",
    contractSignSignatureNote: "(zeichnungsberechtigt gemäss Handelsregister)",
    contractFootnote:
      "Im Rahmen der Bonitätsprüfung behält sich CARIFY das Recht vor, gegebenenfalls zusätzliche Unterlagen anzufordern.",


    // ---- E-Mail (Begleittext zum PDF)
    emailSubjectOffer: "Ihre CARIFY Offerte",
    emailSubjectFollowUp: "Ihre CARIFY Offerte vom {{datum}}",
    emailFollowUp:
      "{{briefanrede}}\n\n" +
      "Konnten Sie sich die Offerte vom {{datum}} schon ansehen? Bei Fragen, etwa zur Versicherung oder zum Kilometerpaket, helfe ich gerne weiter.\n\n" +
      "Die Fahrzeuge sind nicht reserviert. Nennen Sie mir Ihren Favoriten, dann bereite ich den Vertrag vor.\n\n" +
      "Freundliche Grüsse\n{{ansprechpartner}}",
    emailSubjectContract: "Ihr CARIFY Auto-Abo Vertrag",
    emailOffer:
      "{{briefanrede}}\n\n" +
      "Vielen Dank für das angenehme Gespräch. Wie besprochen sende ich Ihnen im Anhang Ihre Offerte {{zum_fahrzeug}}.\n\n" +
      "Die Offerte ist {{gueltig_tage}} Tage gültig. Bei Fragen bin ich gerne für Sie da.\n\n" +
      "Freundliche Grüsse\n{{ansprechpartner}}",
    emailContract:
      "{{briefanrede}}\n\n" +
      "Vielen Dank für Ihr Vertrauen. Im Anhang finden Sie Ihren Auto-Abo Vertrag. Bitte senden Sie uns diesen unterschrieben zurück.\n\n" +
      "Bei Fragen bin ich gerne für Sie da.\n\n" +
      "Freundliche Grüsse\n{{ansprechpartner}}",
  };

  const TEXTS_FR = {
    coverIntro:
      "Avec l’abonnement auto, les entreprises utilisent des véhicules en toute flexibilité – sans immobiliser de capital, sans charge administrative et avec une mensualité fixe.\n\n" +
      "L’assurance, le service, les pneus, les taxes et l’immatriculation sont inclus. Vous roulez, nous nous occupons du reste.\n\n" +
      "La mobilité reste simple, planifiable et adaptable à tout moment.",
    coverButton: "vers l’offre",
    coverClaim: "L’abonnement auto pour les entreprises",
    letterTitle: "Votre offre",
    letterBody:
      "{{briefanrede}}\n\n" +
      "Merci beaucoup pour votre intérêt pour CARIFY.\n\n" +
      "Vous trouverez ci-joint l’offre {{zum_fahrzeug}}. L’offre contient également les informations suivantes :\n\n" +
      "{{inhalt}}\n\n" +
      "Nous nous réjouissons de votre retour et d’une collaboration fructueuse.\n\n" +
      "Meilleures salutations",
    letterContactLabel: "Contact :",
    salutationMr: "Bonjour Monsieur {{nachname}},",
    salutationMrs: "Bonjour Madame {{nachname}},",
    salutationNone: "Madame, Monsieur,",
    salutationWordMr: "Monsieur",
    salutationWordMrs: "Madame",
    vehicleSingular: "pour le véhicule souhaité",
    vehiclePlural: "pour les véhicules souhaités",
    whyTitle: "Pourquoi une voiture d’entreprise en abonnement ?",
    whyLead:
      "L’abonnement auto comble le vide entre la location à court terme et le leasing ou l’achat à long terme – avec le bon équilibre entre coûts, flexibilité et durée.",
    whyChart: {
      yAxis: "Coûts (CHF)",
      xAxis: "Engagement (durée)",
      items: [
        { label: "Taxi / Uber", range: "minutes – heures" },
        { label: "Car sharing", range: "heures – jours" },
        { label: "Location", range: "jours – semaines" },
        { label: "Abonnement auto", range: "3 mois – 4 ans" },
        { label: "Leasing", range: "3 – 5 ans" },
        { label: "Achat", range: "5 – 10 ans" },
      ],
    },
    included: [
      { title: "Assurance", text: "Incluse, franchise réduite sur demande." },
      { title: "Dépannage 24h/24", text: "Assistance à toute heure, aussi à l’étranger." },
      { title: "Véhicule de remplacement", text: "En cas de panne, un remplacement est vite disponible." },
      { title: "Service & entretien", text: "Service, usure et pneus inclus." },
      { title: "Taxes & immatriculation", text: "Nous nous occupons de l’immatriculation et des taxes." },
    ],
    usps: [
      { title: "Rapidement disponible", text: "Véhicules disponibles à court terme et remplacés rapidement si besoin." },
      { title: "Transparence des coûts", text: "Une mensualité tout compris, sans immobilisation de capital ni frais cachés." },
      { title: "Flexibilité maximale", text: "Utiliser les véhicules seulement aussi longtemps que nécessaire." },
      { title: "Charge minimale", text: "Un seul interlocuteur, aucune gestion de flotte opérationnelle." },
    ],
    optionsTitle: "Options pour les entreprises",
    optionsIntro: "",
    options: [],
    pricesTitle: "Offre",
    colVehicle: "Véhicule",
    colTerm: "Durée min.*",
    colKm: "KM**",
    colPriceExcl: "Prix hors TVA",
    colPriceIncl: "Prix TVA incl.",
    colPrice: "Prix",
    colInsurance: "Upgrade assurance",
    insuranceNote: "Assurance + {{betrag}}",
    privateSurchargeNote: "Pour une réservation privée, un supplément de {{betrag}} par mois s’ajoute.",
    validityNote:
      "Cette offre {{indikativ}}est valable {{gueltig_tage}} jours (jusqu’au {{gueltig_bis}}). {{mwst_hinweis}}\n" +
      "Les véhicules ne sont pas réservés automatiquement. Les prix peuvent changer après l’échéance.",
    indicativeWord: "indicative ",
    vatExcl: "Tous les prix hors TVA.",
    vatIncl: "Tous les prix TVA incluse.",
    vatBoth: "Prix hors TVA et TVA {{mwst_satz}} incluse.",
    footnoteTerm: "* Durée minimale en mois, ensuite résiliable chaque mois",
    footnoteKm: "** Kilomètres par mois",
    bestPriceTitle: "",
    bestPriceText: "",
    footerClaim: "",
    contractTitle: "Contrat d’abonnement auto",
    contractNumberLabel: "Contrat n°",
    contractAdjustmentSuffix: " – avenant",
    contractTakeoverSubtitle: "Avenant au contrat",
    contractVehiclesIntroAdjustment: "Concernant les véhicules suivants de CARIFY :",
    contractVehiclesIntroTakeover: "L’abonné reprend les véhicules suivants :",
    contractFieldStartAdjustment: "Durée minimale jusqu’au",
    contractFieldStartTakeover: "Date de modification",
    contractFieldVehicleId: "ID du véhicule",
    contractEach: "",
    contractDownPaymentText: "La mensualité tient compte d’un acompte de **{{betrag}}** ({{mwst}}) et s’applique pendant la durée minimale.",
    contractBetween: "entre",
    contractCarifyAlias: "ci-après dénommée « CARIFY ».",
    contractCustomerLabel: "Entreprise / pers. morale\nAdresse",
    contractCustomerAlias: "ci-après dénommée « l’abonné ».",
    contractCustomerNote: "",
    contractVehiclesIntro: "L’abonné reprend les véhicules suivants de CARIFY :",
    contractFieldModel: "Modèle du véhicule",
    contractFieldStart: "Début prévu de l’abonnement",
    contractFieldKm: "Forfait kilométrique par mois",
    contractFieldTerm: "Durée minimale en mois",
    contractFieldInsurance: "Package d’assurance",
    contractFieldPackage: "Type de package",
    contractReplacement:
      "Si des véhicules ne devaient pas être disponibles pour quelque raison que ce soit, CARIFY propose une solution de remplacement appropriée.",
    contractRateTitle: "Mensualité",
    contractRateText:
      "Pour les véhicules et le service, CARIFY facture une redevance mensuelle par véhicule. {{aborate_satz}}{{aufpreis_satz}}\n" +
      "La redevance est facturée mensuellement à l’abonné et est due le 1er jour de chaque mois d’abonnement.\n" +
      "{{mehrkm_satz}} Après la durée minimale, le délai de résiliation est de {{kuendigungsfrist}} pour la fin d’un mois d’abonnement.\n" +
      "Les conditions générales (CG) de CARIFY s’appliquent.",
    contractRateOne: "Celle-ci s’élève à **{{betrag}} par mois** ({{mwst}}).",
    contractRateEach: "Celle-ci s’élève par véhicule à **{{betrag}} par mois** ({{mwst}}).",
    contractRateGroups: "Celle-ci s’élève par véhicule et par mois ({{mwst}}) à {{liste}}.",
    contractRateFor: "**{{betrag}}** pour {{modell}}",
    contractSurchargeText: "En sus, par véhicule et par mois ({{mwst}}) : {{liste}}.",
    contractSurchargeInsurance: "**{{betrag}}** pour l’upgrade d’assurance",
    contractSurchargePackage: "**{{betrag}}** pour le package {{paket}}",
    contractExtraKmOne: "Les kilomètres supplémentaires sont facturés à la restitution du véhicule à **{{betrag}} par km** ({{mwst}}).",
    contractExtraKmGroups: "Les kilomètres supplémentaires sont facturés à la restitution du véhicule par km ({{mwst}}) : {{liste}}.",
    contractVatExcl: "hors TVA",
    contractVatIncl: "TVA incluse",
    listAnd: " et ",
    contractSignaturesTitle: "Signatures",
    contractSignCarify: "CARIFY",
    contractSignCarifyRole: "Représentant de l’entreprise",
    contractSignCustomer: "Abonné",
    contractSignPlaceDate: "Lieu, date",
    contractSignName: "Nom, prénom",
    contractSignSignature: "Signature juridiquement valable",
    contractSignSignatureNote: "(autorisé·e à signer selon le registre du commerce)",
    contractFootnote:
      "Dans le cadre de la vérification de solvabilité, CARIFY se réserve le droit de demander des documents supplémentaires.",
    emailSubjectOffer: "Votre offre CARIFY",
    emailSubjectFollowUp: "Votre offre CARIFY du {{datum}}",
    emailFollowUp:
      "{{briefanrede}}\n\n" +
      "Avez-vous déjà pu consulter l’offre du {{datum}} ? Je réponds volontiers à vos questions, par exemple sur l’assurance ou le forfait kilométrique.\n\n" +
      "Les véhicules ne sont pas réservés. Indiquez-moi votre favori et je prépare le contrat.\n\n" +
      "Meilleures salutations\n{{ansprechpartner}}",
    emailSubjectContract: "Votre contrat d’abonnement auto CARIFY",
    emailOffer:
      "{{briefanrede}}\n\n" +
      "Merci pour notre agréable échange. Comme convenu, vous trouverez en annexe votre offre {{zum_fahrzeug}}.\n\n" +
      "L’offre est valable {{gueltig_tage}} jours. Je reste volontiers à votre disposition pour toute question.\n\n" +
      "Meilleures salutations\n{{ansprechpartner}}",
    emailContract:
      "{{briefanrede}}\n\n" +
      "Merci pour votre confiance. Vous trouverez en annexe votre contrat d’abonnement auto. Merci de nous le retourner signé.\n\n" +
      "Je reste volontiers à votre disposition pour toute question.\n\n" +
      "Meilleures salutations\n{{ansprechpartner}}",
  };

  const TEXTS_EN = {
    coverIntro:
      "With a car subscription, companies use vehicles flexibly – no capital tied up, no administrative effort and one fixed monthly rate.\n\n" +
      "Insurance, service, tyres, taxes and registration are included. You drive, we take care of the rest.\n\n" +
      "Mobility stays simple, predictable and adjustable at any time.",
    coverButton: "to the offer",
    coverClaim: "Car subscription for companies",
    letterTitle: "Your offer",
    letterBody:
      "{{briefanrede}}\n\n" +
      "Thank you very much for your interest in CARIFY.\n\n" +
      "Please find attached the offer {{zum_fahrzeug}}. The offer also contains the following information:\n\n" +
      "{{inhalt}}\n\n" +
      "We look forward to hearing from you and to a successful partnership.\n\n" +
      "Kind regards",
    letterContactLabel: "Contact:",
    salutationMr: "Dear Mr {{nachname}}",
    salutationMrs: "Dear Ms {{nachname}}",
    salutationNone: "Dear Sir or Madam",
    salutationWordMr: "Mr",
    salutationWordMrs: "Ms",
    vehicleSingular: "for the requested vehicle",
    vehiclePlural: "for the requested vehicles",
    whyTitle: "Why a company car on subscription?",
    whyLead:
      "A car subscription closes the gap between short-term rental and long-term leasing or purchase – with the right balance of cost, flexibility and duration.",
    whyChart: {
      yAxis: "Cost (CHF)",
      xAxis: "Commitment (duration)",
      items: [
        { label: "Taxi / Uber", range: "minutes – hours" },
        { label: "Car sharing", range: "hours – days" },
        { label: "Rental", range: "days – weeks" },
        { label: "Car subscription", range: "3 months – 4 years" },
        { label: "Leasing", range: "3 – 5 years" },
        { label: "Purchase", range: "5 – 10 years" },
      ],
    },
    included: [
      { title: "Insurance", text: "Included, reduced excess on request." },
      { title: "24h roadside assistance", text: "Help around the clock, also abroad." },
      { title: "Replacement car", text: "If a car is out of service, a replacement is quickly available." },
      { title: "Service & maintenance", text: "Service, wear and tyres are included." },
      { title: "Taxes & registration", text: "We handle registration and road taxes." },
    ],
    usps: [
      { title: "Ready fast", text: "Vehicles are available at short notice and replaced quickly if needed." },
      { title: "Full cost transparency", text: "One all-inclusive monthly rate, no capital tied up, no hidden costs." },
      { title: "Maximum flexibility", text: "Use vehicles only as long as you really need them." },
      { title: "Minimal effort", text: "One contact for everything, no operational fleet work." },
    ],
    optionsTitle: "Options for business customers",
    optionsIntro: "",
    options: [],
    pricesTitle: "Offer",
    colVehicle: "Vehicle",
    colTerm: "Min. term*",
    colKm: "KM**",
    colPriceExcl: "Price excl. VAT",
    colPriceIncl: "Price incl. VAT",
    colPrice: "Price",
    colInsurance: "Insurance upgrade",
    insuranceNote: "Insurance + {{betrag}}",
    privateSurchargeNote: "For a private booking, a surcharge of {{betrag}} per month applies.",
    validityNote:
      "This {{indikativ}}offer is valid for {{gueltig_tage}} days (until {{gueltig_bis}}). {{mwst_hinweis}}\n" +
      "The vehicles are not reserved automatically. Prices may change after the offer has expired.",
    indicativeWord: "indicative ",
    vatExcl: "All prices excl. VAT.",
    vatIncl: "All prices incl. VAT.",
    vatBoth: "Prices excl. and incl. {{mwst_satz}} VAT.",
    footnoteTerm: "* Minimum term in months, cancellable monthly afterwards",
    footnoteKm: "** Kilometres per month",
    bestPriceTitle: "",
    bestPriceText: "",
    footerClaim: "",
    contractTitle: "Car Subscription Contract",
    contractNumberLabel: "Contract no.",
    contractAdjustmentSuffix: " – adjustment",
    contractTakeoverSubtitle: "Contract adjustment",
    contractVehiclesIntroAdjustment: "Regarding the following vehicles from CARIFY:",
    contractVehiclesIntroTakeover: "The Subscriber takes over the following vehicles:",
    contractFieldStartAdjustment: "Minimum term until",
    contractFieldStartTakeover: "Date of change",
    contractFieldVehicleId: "Vehicle ID",
    contractEach: "",
    contractDownPaymentText: "The fee takes into account a down payment of **{{betrag}}** ({{mwst}}) and applies during the minimum term.",
    contractBetween: "between",
    contractCarifyAlias: "hereinafter referred to as “CARIFY”.",
    contractCustomerLabel: "Company / legal person\nAddress",
    contractCustomerAlias: "hereinafter referred to as “Subscriber”.",
    contractCustomerNote: "",
    contractVehiclesIntro: "The Subscriber receives the following vehicles from CARIFY:",
    contractFieldModel: "Vehicle / type",
    contractFieldStart: "Desired subscription start",
    contractFieldKm: "Kilometre package per month",
    contractFieldTerm: "Minimum duration in months",
    contractFieldInsurance: "Insurance package",
    contractFieldPackage: "Package type",
    contractReplacement:
      "If, for any reason, a vehicle becomes unavailable, CARIFY provides an appropriate alternative solution.",
    contractRateTitle: "Subscription fee",
    contractRateText:
      "For the vehicles and the service, CARIFY charges a vehicle-related monthly fee. {{aborate_satz}}{{aufpreis_satz}}\n" +
      "The fee is invoiced monthly to the Subscriber and is due on the 1st day of the subscription month.\n" +
      "{{mehrkm_satz}} After the minimum term, the notice period is {{kuendigungsfrist}} to the end of the respective subscription month.\n" +
      "CARIFY’s general terms and conditions apply.",
    contractRateOne: "This amounts to **{{betrag}} per month** ({{mwst}}).",
    contractRateEach: "This amounts to **{{betrag}} per vehicle and month** ({{mwst}}).",
    contractRateGroups: "Per vehicle and month ({{mwst}}) this amounts to {{liste}}.",
    contractRateFor: "**{{betrag}}** for {{modell}}",
    contractSurchargeText: "Plus, per vehicle and month ({{mwst}}), {{liste}}.",
    contractSurchargeInsurance: "**{{betrag}}** for the insurance upgrade",
    contractSurchargePackage: "**{{betrag}}** for the {{paket}} package",
    contractExtraKmOne: "Additional kilometres are charged at **{{betrag}} per km** ({{mwst}}) when the vehicle is returned.",
    contractExtraKmGroups: "Additional kilometres are charged per km ({{mwst}}) when the vehicle is returned: {{liste}}.",
    contractVatExcl: "excl. VAT",
    contractVatIncl: "incl. VAT",
    listAnd: " and ",
    contractSignaturesTitle: "Signatures",
    contractSignCarify: "CARIFY",
    contractSignCarifyRole: "Company representative",
    contractSignCustomer: "Subscriber",
    contractSignPlaceDate: "Location, date",
    contractSignName: "Name, first name",
    contractSignSignature: "Legally valid signature",
    contractSignSignatureNote: "(authorised to sign according to the commercial register)",
    contractFootnote:
      "If necessary, CARIFY may request additional documents as part of the creditworthiness assessment.",
    emailSubjectOffer: "Your CARIFY offer",
    emailSubjectFollowUp: "Your CARIFY offer of {{datum}}",
    emailFollowUp:
      "{{briefanrede}}\n\n" +
      "Have you had a chance to look at the offer of {{datum}}? I am happy to answer any questions, for example about insurance or the kilometre package.\n\n" +
      "The vehicles are not reserved. Let me know your favourite and I will prepare the contract.\n\n" +
      "Kind regards\n{{ansprechpartner}}",
    emailSubjectContract: "Your CARIFY car subscription contract",
    emailOffer:
      "{{briefanrede}}\n\n" +
      "Thank you for the pleasant conversation. As discussed, please find attached your offer {{zum_fahrzeug}}.\n\n" +
      "The offer is valid for {{gueltig_tage}} days. Please let me know if you have any questions.\n\n" +
      "Kind regards\n{{ansprechpartner}}",
    emailContract:
      "{{briefanrede}}\n\n" +
      "Thank you for your trust. Please find attached your car subscription contract. Kindly return it to us signed.\n\n" +
      "Please let me know if you have any questions.\n\n" +
      "Kind regards\n{{ansprechpartner}}",
  };

  function settings() {
    return {
      schema: SCHEMA,
      label: "Standard (ohne Firmendaten)",
      company: {
        name: "CARIFY",
        legalName: "",
        street: "",
        zip: "",
        city: "",
        country: "CH",
        web: "",
      },
      team: [],
      defaults: {
        terms: [3, 6, 12, 18, 24, 36, 48],
        kmPackages: [500, 750, 1000, 1750, 2500, 3000],
        vatRate: 8.1,
        offerValidityDays: 5,
        offerIndicative: true,
        vatMode: "excl",
        insuranceDisplay: "none",
        extraKmRate: null,
        noticePeriod: "14 Tage",
        insurancePackages: [],
        packageTypes: [],
      },
      branding: {
        logo: "",
        coverImage: "",
        whyImage: "",
        references: [],
        referenceLogos: [],
        badges: [],
      },
      catalog: [],
      texts: { de: TEXTS_DE, fr: TEXTS_FR, en: TEXTS_EN },
    };
  }

  return { SCHEMA, settings };
})();
