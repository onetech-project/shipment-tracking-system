// Captured by running the prototype's engine section (lines 110–673 of
// simulasi-rekomendasi-rute-v3.backup-2026-10-03b.html) headless in Node on 2026-10-03, on its own
// seed data and default state. Do not edit by hand: re-capture from the prototype if it changes.
export const expected = {
  "plan": [
    {
      "lane": "SILI~Jabo|Aceh~Garuda Air CGK",
      "kg": 187
    },
    {
      "lane": "PRIME~Jabo|Aceh~Garuda Air CGK",
      "kg": 62
    },
    {
      "lane": "ESP~Jabo|Aceh~Citilink CGK",
      "kg": 108
    },
    {
      "lane": "SILI~Jabo|Ambon~Citilink CGK",
      "kg": 96
    },
    {
      "lane": "SILI~Jabo|Ambon~Garuda Air CGK",
      "kg": 150
    },
    {
      "lane": "SILI~Jabo|Balikpapan~Citilink CGK",
      "kg": 25
    },
    {
      "lane": "SILI~Jabo|Balikpapan~Garuda Air CGK",
      "kg": 278
    },
    {
      "lane": "ESP~Jabo|Balikpapan~Citilink CGK",
      "kg": 130
    },
    {
      "lane": "ESP~Jabo|Balikpapan~Garuda Air CGK",
      "kg": 139
    },
    {
      "lane": "SILI~Jabo|Banjarmasin~Citilink CGK",
      "kg": 93
    },
    {
      "lane": "ESP~Jabo|Banjarmasin~Pelita Air",
      "kg": 147
    },
    {
      "lane": "PELITA~Jabo|Banjarmasin~Pelita Air",
      "kg": 121
    },
    {
      "lane": "SILI~Jabo|Batam~Citilink CGK",
      "kg": 252
    },
    {
      "lane": "PRIME~Jabo|Batam~Garuda Air CGK",
      "kg": 22
    },
    {
      "lane": "ESP~Jabo|Batam~Citilink CGK",
      "kg": 117
    },
    {
      "lane": "SILI~Jabo|Denpasar~Garuda Air CGK",
      "kg": 102
    },
    {
      "lane": "ESP~Jabo|Denpasar~Pelita Air",
      "kg": 178
    },
    {
      "lane": "PELITA~Jabo|Denpasar~Pelita Air",
      "kg": 129
    },
    {
      "lane": "SILI~Jabo|Kendari~Citilink CGK",
      "kg": 37
    },
    {
      "lane": "SILI~Jabo|Kendari~Garuda Air CGK",
      "kg": 130
    },
    {
      "lane": "SILI~Jabo|Kendari~Pelita Air",
      "kg": 86
    },
    {
      "lane": "SILI~Jabo|Makassar~Garuda Air CGK",
      "kg": 355
    },
    {
      "lane": "PRIME~Jabo|Makassar~Garuda Air CGK",
      "kg": 11
    },
    {
      "lane": "ESP~Jabo|Makassar~Citilink CGK",
      "kg": 142
    },
    {
      "lane": "PELITA~Jabo|Makassar~Pelita Air",
      "kg": 121
    },
    {
      "lane": "ESP~Jabo|Padang~Citilink CGK",
      "kg": 217
    },
    {
      "lane": "PRIME~Jabo|Palangka Raya~Garuda Air CGK",
      "kg": 148
    },
    {
      "lane": "SILI~Jabo|Pekanbaru~Citilink CGK",
      "kg": 98
    },
    {
      "lane": "ESP~Jabo|Pekanbaru~Pelita Air",
      "kg": 119
    },
    {
      "lane": "PELITA~Jabo|Pekanbaru~Pelita Air",
      "kg": 85
    },
    {
      "lane": "ESP~Jabo|Tanjung Pandan~Citilink CGK",
      "kg": 126
    },
    {
      "lane": "PRIME~Jabo|Tanjung Pinang~Garuda Air CGK",
      "kg": 151
    },
    {
      "lane": "SILI~Surabaya|Balikpapan~Citilink CGK",
      "kg": 121
    },
    {
      "lane": "ESP~Surabaya|Balikpapan~Citilink CGK",
      "kg": 108
    },
    {
      "lane": "SILI~Surabaya|Banjarmasin~Citilink CGK",
      "kg": 111
    },
    {
      "lane": "PELITA~Surabaya|Banjarmasin~Pelita Air",
      "kg": 106
    },
    {
      "lane": "SILI~Surabaya|Batam~Citilink CGK",
      "kg": 152
    }
  ],
  "net": 8976265,
  "revenue": 84501200,
  "cost": 75208120,
  "reasons": [
    [
      "Jabo|Aceh",
      "load"
    ],
    [
      "Jabo|Ambon",
      "load"
    ],
    [
      "Jabo|Balikpapan",
      "load"
    ],
    [
      "Jabo|Banjarmasin",
      "load"
    ],
    [
      "Jabo|Batam",
      "load"
    ],
    [
      "Jabo|Denpasar",
      "load"
    ],
    [
      "Jabo|Kendari",
      "load"
    ],
    [
      "Jabo|Makassar",
      "load"
    ],
    [
      "Jabo|Padang",
      "single"
    ],
    [
      "Jabo|Palangka Raya",
      "single"
    ],
    [
      "Jabo|Pekanbaru",
      "load"
    ],
    [
      "Jabo|Tanjung Pandan",
      "single"
    ],
    [
      "Jabo|Tanjung Pinang",
      "single"
    ],
    [
      "Surabaya|Balikpapan",
      "load"
    ],
    [
      "Surabaya|Banjarmasin",
      "load"
    ],
    [
      "Surabaya|Batam",
      "single"
    ]
  ]
} as const
