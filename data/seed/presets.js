// Chronological local battle starting conditions; outcomes are never scripted.
export const SEED_PRESETS = [
  {
    "id": "ce-heliopolis-ginn",
    "name": "01 · SEED · 殖民地初战",
    "scenario": {
      "battlefieldId": "seed-heliopolis-interior",
      "missionId": "ce-local-duel",
      "environmentId": "land",
      "distanceM": 240,
      "altitudeM": 0,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-strike-unarmed-start",
          "pilotId": "seed-kira",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack",
          "pilotOptions": {
            "skills": {
              "seed-focus": false,
              "mercy-strike": false,
              "battle-os-adaptation": true
            },
            "strategies": {
              "drift-window": false,
              "pursuit-fire": false
            }
          },
          "initialState": {
            "velocity": [
              0,
              0,
              0
            ]
          }
        }
      ],
      "bForces": [
        {
          "machineId": "seed-ginn-miguel",
          "pilotId": "seed-miguel",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack",
          "initialState": {
            "velocity": [
              0,
              0,
              0
            ]
          }
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -120,
          "y": 0,
          "z": 0
        },
        {
          "id": "b-0-0",
          "x": 120,
          "y": 0,
          "z": 0
        }
      ],
      "maxSeconds": 180
    }
  },
  {
    "id": "ce-orbital-interception",
    "name": "02 · SEED · 宇宙夹击与PS危机",
    "scenario": {
      "battlefieldId": "pursuit-space",
      "missionId": "ce-orbital-route",
      "environmentId": "space",
      "distanceM": 6500,
      "altitudeM": 0,
      "focus": "overall",
      "mode": "auto",
      "maxSeconds": 480,
      "aForces": [
        {
          "machineId": "seed-archangel-pack-support",
          "pilotId": "seed-murrue",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective"
        },
        {
          "machineId": "seed-strike-field-packs",
          "pilotId": "seed-kira",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "initialState": {
            "loadoutId": "aile",
            "velocity": [
              200,
              0,
              0
            ]
          },
          "pilotOptions": {
            "skills": {
              "seed-focus": false,
              "mercy-strike": false,
              "battle-os-adaptation": false
            }
          }
        },
        {
          "machineId": "seed-mobius-zero",
          "pilotId": "seed-mu",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "velocity": [
              250,
              0,
              0
            ]
          }
        }
      ],
      "bForces": [
        {
          "machineId": "seed-duel",
          "pilotId": "seed-yzak",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective"
        },
        {
          "machineId": "seed-buster",
          "pilotId": "seed-dearka",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective"
        },
        {
          "machineId": "seed-aegis",
          "pilotId": "seed-athrun",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "pilotOptions": {
            "skills": {
              "seed-focus": false
            },
            "strategies": {
              "capture-restraint": true
            }
          }
        },
        {
          "machineId": "seed-blitz",
          "pilotId": "seed-nicol",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective"
        },
        {
          "machineId": "seed-vesalius",
          "pilotId": "seed-rau",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective"
        },
        {
          "machineId": "seed-gamow",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 1,
          "strategy": "objective"
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": 0,
          "y": 0,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": 500,
          "y": 500,
          "z": 500
        },
        {
          "id": "a-2-0",
          "x": 14500,
          "y": 1200,
          "z": 4300
        },
        {
          "id": "b-0-0",
          "x": 10000,
          "y": 200,
          "z": 200
        },
        {
          "id": "b-1-0",
          "x": 10500,
          "y": 480,
          "z": -240
        },
        {
          "id": "b-2-0",
          "x": 3200,
          "y": 500,
          "z": 700
        },
        {
          "id": "b-3-0",
          "x": 10200,
          "y": 720,
          "z": 320
        },
        {
          "id": "b-4-0",
          "x": 18500,
          "y": 0,
          "z": 2500
        },
        {
          "id": "b-5-0",
          "x": -28000,
          "y": 0,
          "z": -10000
        }
      ]
    }
  },
  {
    "id": "ce-awakening-defense",
    "name": "03 · SEED · 三机突袭与首次觉醒",
    "scenario": {
      "battlefieldId": "pursuit-space",
      "missionId": "ce-awakening-route",
      "environmentId": "space",
      "distanceM": 6500,
      "altitudeM": 0,
      "focus": "overall",
      "mode": "auto",
      "maxSeconds": 360,
      "aForces": [
        {
          "machineId": "seed-archangel",
          "pilotId": "seed-murrue",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-aile-strike",
          "pilotId": "seed-kira",
          "stateId": "period-2",
          "count": 1,
          "strategy": "escort",
          "pilotOptions": {
            "skills": {
              "seed-focus": false,
              "seed-first-awakening": true,
              "mercy-strike": false
            }
          },
          "initialState": {
            "velocity": [
              200,
              0,
              0
            ]
          }
        },
        {
          "machineId": "seed-mobius-zero",
          "pilotId": "seed-mu",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "initialState": {
            "velocity": [
              200,
              0,
              0
            ]
          }
        }
      ],
      "bForces": [
        {
          "machineId": "seed-duel",
          "pilotId": "seed-yzak",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack",
          "initialState": {
            "velocity": [
              -180,
              0,
              0
            ]
          }
        },
        {
          "machineId": "seed-buster",
          "pilotId": "seed-dearka",
          "stateId": "period-1",
          "count": 1,
          "strategy": "screen",
          "initialState": {
            "velocity": [
              0,
              0,
              -180
            ]
          }
        },
        {
          "machineId": "seed-blitz",
          "pilotId": "seed-nicol",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "velocity": [
              -300,
              0,
              0
            ]
          }
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": 0,
          "y": 0,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": 4800,
          "y": 200,
          "z": 500
        },
        {
          "id": "a-2-0",
          "x": 3200,
          "y": 500,
          "z": 2800
        },
        {
          "id": "b-0-0",
          "x": 7500,
          "y": 300,
          "z": 700
        },
        {
          "id": "b-1-0",
          "x": 11500,
          "y": 200,
          "z": -5000
        },
        {
          "id": "b-2-0",
          "x": 1800,
          "y": -600,
          "z": 1400
        }
      ]
    }
  },
  {
    "id": "ce-eighth-fleet-reentry",
    "name": "04 · SEED · 第八舰队断后降落",
    "scenario": {
      "battlefieldId": "seed-orbital-reentry",
      "missionId": "ce-eighth-fleet-route",
      "environmentId": "orbit",
      "distanceM": 9000,
      "altitudeM": 110000,
      "focus": "overall",
      "mode": "auto",
      "maxSeconds": 480,
      "aForces": [
        {
          "machineId": "seed-archangel",
          "pilotId": "seed-murrue",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "velocity": [
              -160,
              -130,
              0
            ]
          }
        },
        {
          "machineId": "seed-aile-strike",
          "pilotId": "seed-kira",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "initialState": {
            "velocity": [
              -180,
              -120,
              0
            ],
            "totalEnergyFraction": 0.7
          },
          "pilotOptions": {
            "skills": {
              "mercy-strike": false,
              "battle-os-adaptation": false
            }
          }
        },
        {
          "machineId": "seed-menelaos",
          "pilotId": "seed-halberton",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "velocity": [
              210,
              0,
              0
            ],
            "structureFraction": 0.28,
            "armorFraction": 0.35,
            "forward": [
              1,
              0,
              0
            ]
          }
        },
        {
          "machineId": "seed-drake",
          "pilotId": "ship-crew",
          "stateId": "standard",
          "count": 2,
          "strategy": "screen",
          "initialState": {
            "velocity": [
              0,
              0,
              0
            ],
            "structureFraction": 0.2,
            "armorFraction": 0.35
          }
        },
        {
          "machineId": "seed-mobius",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 2,
          "strategy": "screen",
          "initialState": {
            "velocity": [
              150,
              0,
              0
            ]
          }
        },
        {
          "machineId": "seed-shuttle",
          "pilotId": "unmanned",
          "stateId": "automatic",
          "count": 1,
          "strategy": "simple",
          "initialState": {
            "velocity": [
              -120,
              -80,
              0
            ],
            "forward": [
              -1,
              -1,
              0
            ]
          }
        }
      ],
      "bForces": [
        {
          "machineId": "seed-duel-assault",
          "pilotId": "seed-yzak",
          "stateId": "ce71-enraged",
          "count": 1,
          "strategy": "attack",
          "initialState": {
            "velocity": [
              -220,
              -100,
              0
            ]
          },
          "pilotOptions": {}
        },
        {
          "machineId": "seed-buster",
          "pilotId": "seed-dearka",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "velocity": [
              -150,
              0,
              0
            ]
          }
        },
        {
          "machineId": "seed-blitz",
          "pilotId": "seed-nicol",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "velocity": [
              -150,
              0,
              0
            ]
          }
        },
        {
          "machineId": "seed-aegis",
          "pilotId": "seed-athrun",
          "stateId": "period-1",
          "count": 1,
          "strategy": "screen",
          "initialState": {
            "velocity": [
              -150,
              0,
              0
            ]
          },
          "pilotOptions": {
            "skills": {
              "seed-focus": false
            }
          }
        },
        {
          "machineId": "seed-gamow",
          "pilotId": "ship-crew",
          "stateId": "standard",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "velocity": [
              -210,
              0,
              0
            ],
            "structureFraction": 0.3,
            "armorFraction": 0.35,
            "forward": [
              -1,
              0,
              0
            ]
          },
          "pilotOptions": {
            "strategies": {
              "terminal-intercept": true
            }
          }
        },
        {
          "machineId": "seed-vesalius",
          "pilotId": "seed-rau",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "velocity": [
              -60,
              0,
              0
            ]
          }
        },
        {
          "machineId": "seed-ginn",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 2,
          "strategy": "screen",
          "initialState": {
            "velocity": [
              -150,
              0,
              0
            ]
          }
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -6000,
          "y": 110000,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -4200,
          "y": 110000,
          "z": 500
        },
        {
          "id": "a-2-0",
          "x": -500,
          "y": 111200,
          "z": -2000
        },
        {
          "id": "a-3-0",
          "x": 6000,
          "y": 110500,
          "z": 4500
        },
        {
          "id": "a-3-1",
          "x": 6800,
          "y": 111000,
          "z": 6000
        },
        {
          "id": "a-4-0",
          "x": 5500,
          "y": 110300,
          "z": 3400
        },
        {
          "id": "a-4-1",
          "x": 5200,
          "y": 111200,
          "z": 3800
        },
        {
          "id": "a-5-0",
          "x": -9000,
          "y": 108000,
          "z": -5500
        },
        {
          "id": "b-0-0",
          "x": -600,
          "y": 110000,
          "z": 500
        },
        {
          "id": "b-1-0",
          "x": 7000,
          "y": 110500,
          "z": 3500
        },
        {
          "id": "b-2-0",
          "x": 6500,
          "y": 111000,
          "z": 1000
        },
        {
          "id": "b-3-0",
          "x": 8200,
          "y": 111200,
          "z": -1000
        },
        {
          "id": "b-4-0",
          "x": 2500,
          "y": 111200,
          "z": -2000
        },
        {
          "id": "b-5-0",
          "x": 20000,
          "y": 112000,
          "z": 7000
        },
        {
          "id": "b-6-0",
          "x": 4000,
          "y": 110300,
          "z": 4200
        },
        {
          "id": "b-6-1",
          "x": 4500,
          "y": 111200,
          "z": 4600
        }
      ]
    }
  },
  {
    "id": "ce-desert-lagowe",
    "name": "05 · SEED · 沙漠虎最终决斗",
    "scenario": {
      "battlefieldId": "seed-desert",
      "missionId": "annihilation",
      "environmentId": "desert",
      "distanceM": 1600,
      "altitudeM": 0,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-aile-strike",
          "pilotId": "seed-kira",
          "stateId": "period-2",
          "count": 1,
          "strategy": "attack",
          "pilotOptions": {
            "skills": {
              "seed-focus": true,
              "mercy-strike": false
            },
            "strategies": {
              "blade-entry": true,
              "gun-close": true
            }
          },
          "initialState": {
            "weaponAmmo": {
              "w1-rifle": 0
            }
          }
        }
      ],
      "bForces": [
        {
          "machineId": "seed-lagowe",
          "pilotId": "seed-andrew",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        }
      ],
      "maxSeconds": 360
    }
  },
  {
    "id": "ce-orb-departure",
    "name": "06 · SEED · 奥布出港与迅雷救援",
    "scenario": {
      "battlefieldId": "seed-orb-islands",
      "missionId": "ce-orb-departure-duel",
      "environmentId": "air",
      "distanceM": 6000,
      "altitudeM": 1000,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-archangel",
          "pilotId": "seed-murrue",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-sword-strike",
          "pilotId": "seed-kira",
          "stateId": "period-2",
          "count": 1,
          "strategy": "objective"
        },
        {
          "machineId": "seed-skygrasper-launcher",
          "pilotId": "seed-mu",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "initialState": {
            "velocity": [
              260,
              0,
              0
            ]
          }
        },
        {
          "machineId": "seed-skygrasper",
          "pilotId": "seed-tolle",
          "stateId": "period-1",
          "count": 1,
          "strategy": "screen",
          "initialState": {
            "velocity": [
              260,
              0,
              0
            ]
          }
        }
      ],
      "bForces": [
        {
          "machineId": "seed-aegis",
          "pilotId": "seed-athrun",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack",
          "pilotOptions": {
            "skills": {
              "seed-focus": false
            },
            "strategies": {
              "capture-disabled": false,
              "capture-position": false
            }
          }
        },
        {
          "machineId": "seed-duel-assault",
          "pilotId": "seed-yzak",
          "stateId": "period-1",
          "count": 1,
          "strategy": "screen",
          "mountId": "b-4-0",
          "mountOffset": [
            0,
            8,
            0
          ]
        },
        {
          "machineId": "seed-buster",
          "pilotId": "seed-dearka",
          "stateId": "period-1",
          "count": 1,
          "strategy": "screen",
          "mountId": "b-4-1",
          "mountOffset": [
            0,
            8,
            0
          ]
        },
        {
          "machineId": "seed-blitz",
          "pilotId": "seed-nicol",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "mountId": "b-4-2",
          "mountOffset": [
            0,
            8,
            0
          ]
        },
        {
          "machineId": "seed-guul",
          "pilotId": "unmanned",
          "stateId": "automatic",
          "count": 3,
          "strategy": "simple",
          "initialState": {
            "velocity": [
              -260,
              0,
              0
            ]
          }
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -6500,
          "y": 500,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -1600,
          "y": 10,
          "z": 0
        },
        {
          "id": "a-2-0",
          "x": -4400,
          "y": 1300,
          "z": -2200
        },
        {
          "id": "a-3-0",
          "x": -4700,
          "y": 1100,
          "z": 1800
        },
        {
          "id": "b-0-0",
          "x": -700,
          "y": 60,
          "z": 0
        },
        {
          "id": "b-1-0",
          "x": 3200,
          "y": 1100,
          "z": 1600
        },
        {
          "id": "b-2-0",
          "x": 3600,
          "y": 1100,
          "z": -1700
        },
        {
          "id": "b-3-0",
          "x": 600,
          "y": 100,
          "z": 500
        },
        {
          "id": "b-4-0",
          "x": 3200,
          "y": 1092,
          "z": 1600
        },
        {
          "id": "b-4-1",
          "x": 3600,
          "y": 1092,
          "z": -1700
        },
        {
          "id": "b-4-2",
          "x": 600,
          "y": 92,
          "z": 500
        }
      ],
      "maxSeconds": 180
    }
  },
  {
    "id": "ce-island-duel",
    "name": "07 · SEED · 群岛追逐与圣盾自爆",
    "scenario": {
      "battlefieldId": "seed-orb-islands",
      "missionId": "ce-island-encounter",
      "environmentId": "air",
      "distanceM": 7000,
      "altitudeM": 500,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-archangel",
          "pilotId": "seed-murrue",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-aile-strike",
          "pilotId": "seed-kira",
          "stateId": "period-2",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-skygrasper-launcher",
          "pilotId": "seed-mu",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "initialState": {
            "velocity": [
              260,
              0,
              0
            ]
          }
        },
        {
          "machineId": "seed-skygrasper",
          "pilotId": "seed-tolle",
          "stateId": "period-1",
          "count": 1,
          "strategy": "screen",
          "initialState": {
            "velocity": [
              260,
              0,
              0
            ]
          }
        }
      ],
      "bForces": [
        {
          "machineId": "seed-aegis",
          "pilotId": "seed-athrun",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack",
          "pilotOptions": {
            "strategies": {
              "last-resort-detonation": true
            }
          }
        },
        {
          "machineId": "seed-duel-assault",
          "pilotId": "seed-yzak",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack",
          "mountId": "b-3-0",
          "mountOffset": [
            0,
            8,
            0
          ]
        },
        {
          "machineId": "seed-buster",
          "pilotId": "seed-dearka",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack",
          "mountId": "b-3-1",
          "mountOffset": [
            0,
            8,
            0
          ]
        },
        {
          "machineId": "seed-guul",
          "pilotId": "unmanned",
          "stateId": "automatic",
          "count": 2,
          "strategy": "simple",
          "initialState": {
            "velocity": [
              -260,
              0,
              0
            ]
          }
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -3500,
          "y": 220,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -1700,
          "y": 550,
          "z": 0
        },
        {
          "id": "a-2-0",
          "x": -3800,
          "y": 1100,
          "z": -3000
        },
        {
          "id": "a-3-0",
          "x": -4800,
          "y": 750,
          "z": 600
        },
        {
          "id": "b-0-0",
          "x": 2200,
          "y": 600,
          "z": 0
        },
        {
          "id": "b-1-0",
          "x": 3000,
          "y": 600,
          "z": 700
        },
        {
          "id": "b-2-0",
          "x": 3400,
          "y": 600,
          "z": -700
        },
        {
          "id": "b-3-0",
          "x": 3000,
          "y": 600,
          "z": 700
        },
        {
          "id": "b-3-1",
          "x": 3400,
          "y": 600,
          "z": -700
        }
      ]
    }
  },
  {
    "id": "ce-orb-cooperation",
    "name": "09 · SEED · 奥布首日双机协防",
    "scenario": {
      "battlefieldId": "seed-sea",
      "missionId": "ce-orb-cooperative-defense",
      "environmentId": "air",
      "distanceM": 6500,
      "altitudeM": 1200,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-freedom",
          "pilotId": "seed-kira",
          "stateId": "period-3",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-justice",
          "pilotId": "seed-athrun",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        }
      ],
      "bForces": [
        {
          "machineId": "seed-calamity",
          "pilotId": "seed-orga",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack",
          "mountId": "b-2-0",
          "mountOffset": [
            0,
            14,
            0
          ]
        },
        {
          "machineId": "seed-forbidden",
          "pilotId": "seed-shani",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-raider",
          "pilotId": "seed-clotho",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -3250,
          "y": 1300,
          "z": -300
        },
        {
          "id": "a-1-0",
          "x": -3250,
          "y": 1300,
          "z": 300
        },
        {
          "id": "b-0-0",
          "x": 3200,
          "y": 1314,
          "z": 700
        },
        {
          "id": "b-1-0",
          "x": 3500,
          "y": 1250,
          "z": -700
        },
        {
          "id": "b-2-0",
          "x": 3200,
          "y": 1300,
          "z": 700
        }
      ]
    }
  },
  {
    "id": "ce-archangel-dominion",
    "name": "11 · SEED · 大天使号终末炮战",
    "scenario": {
      "battlefieldId": "pursuit-space",
      "missionId": "seed-final-fleet",
      "environmentId": "space",
      "distanceM": 22000,
      "altitudeM": 0,
      "focus": "a-1-0",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-archangel",
          "pilotId": "seed-murrue",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "structureFraction": 0.45,
            "energyFraction": 0.55
          }
        },
        {
          "machineId": "seed-aile-strike",
          "pilotId": "seed-mu",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "initialState": {
            "structureFraction": 0.35,
            "armorFraction": 0.3,
            "totalEnergyFraction": 0.18,
            "energyFraction": 0.5
          }
        }
      ],
      "bForces": [
        {
          "machineId": "seed-dominion",
          "pilotId": "ship-crew",
          "stateId": "standard",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "structureFraction": 0.45
          }
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -11000,
          "y": 0,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -10800,
          "y": 0,
          "z": 160
        },
        {
          "id": "b-0-0",
          "x": 11000,
          "y": 0,
          "z": 0
        }
      ]
    }
  },
  {
    "id": "ce-freedom-providence",
    "name": "12 · SEED · 自由与神意最终决斗",
    "scenario": {
      "battlefieldId": "pursuit-space",
      "missionId": "annihilation",
      "environmentId": "space",
      "distanceM": 6000,
      "altitudeM": 0,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-freedom",
          "pilotId": "seed-kira",
          "stateId": "period-6",
          "count": 1,
          "strategy": "attack"
        }
      ],
      "bForces": [
        {
          "machineId": "seed-providence",
          "pilotId": "seed-rau",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        }
      ]
    }
  },
  {
    "id": "ce-armory-ground",
    "name": "14 · SEED DESTINY · 军械库夺机迎击",
    "scenario": {
      "battlefieldId": "seed-armory-interior",
      "missionId": "ce-armory-withdrawal",
      "environmentId": "land",
      "distanceM": 2400,
      "altitudeM": 12,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-sword-impulse",
          "pilotId": "seed-shinn",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack",
          "pilotOptions": {
            "skills": {
              "seed-focus": false
            }
          }
        },
        {
          "machineId": "seed-zaku-warrior-gunner",
          "pilotId": "seed-luna",
          "stateId": "period-1",
          "count": 1,
          "strategy": "screen"
        },
        {
          "machineId": "seed-zaku-phantom-blaze",
          "pilotId": "seed-rey",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        }
      ],
      "bForces": [
        {
          "machineId": "seed-chaos",
          "pilotId": "seed-sting",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "forward": [
              1,
              0,
              0
            ],
            "velocity": [
              140,
              0,
              0
            ]
          }
        },
        {
          "machineId": "seed-abyss",
          "pilotId": "seed-auel",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "forward": [
              1,
              0,
              0
            ],
            "velocity": [
              140,
              0,
              0
            ]
          }
        },
        {
          "machineId": "seed-gaia",
          "pilotId": "seed-stella",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "forward": [
              1,
              0,
              0
            ],
            "velocity": [
              140,
              0,
              0
            ]
          }
        }
      ]
    }
  },
  {
    "id": "ce-u7-demolition",
    "name": "15 · SEED DESTINY · 尤尼乌斯七破拆护卫",
    "scenario": {
      "battlefieldId": "pursuit-space",
      "missionId": "seed-work-protection",
      "environmentId": "space",
      "distanceM": 6000,
      "altitudeM": 0,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-demolition-cutter",
          "pilotId": "unmanned",
          "stateId": "automatic",
          "count": 1,
          "strategy": "simple"
        },
        {
          "machineId": "seed-guaitz",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 2,
          "strategy": "escort"
        },
        {
          "machineId": "seed-zaku-phantom-slash",
          "pilotId": "seed-yzak",
          "stateId": "period-2",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-zaku-warrior-gunner",
          "pilotId": "seed-dearka",
          "stateId": "period-2",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-force-impulse",
          "pilotId": "seed-shinn",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort"
        }
      ],
      "bForces": [
        {
          "machineId": "seed-ginn-high-maneuver-ii",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 4,
          "strategy": "objective"
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -3000,
          "y": 0,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -2000,
          "y": 400,
          "z": 450
        },
        {
          "id": "a-1-1",
          "x": -2000,
          "y": -400,
          "z": -450
        },
        {
          "id": "a-2-0",
          "x": -1200,
          "y": 300,
          "z": 200
        },
        {
          "id": "a-3-0",
          "x": -2000,
          "y": 600,
          "z": -900
        },
        {
          "id": "a-4-0",
          "x": -1300,
          "y": -300,
          "z": 600
        },
        {
          "id": "b-0-0",
          "x": 3000,
          "y": -600,
          "z": -750
        },
        {
          "id": "b-0-1",
          "x": 3000,
          "y": -200,
          "z": -250
        },
        {
          "id": "b-0-2",
          "x": 3000,
          "y": 200,
          "z": 250
        },
        {
          "id": "b-0-3",
          "x": 3000,
          "y": 600,
          "z": 750
        }
      ]
    }
  },
  {
    "id": "ce-minerva-breakout",
    "name": "16 · SEED DESTINY · 密涅瓦外海突破",
    "scenario": {
      "battlefieldId": "seed-sea",
      "missionId": "seed-sea-breakout",
      "environmentId": "air",
      "distanceM": 18000,
      "altitudeM": 900,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-minerva",
          "pilotId": "seed-talia",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-force-impulse",
          "pilotId": "seed-shinn",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-zaku-warrior-gunner",
          "pilotId": "seed-luna",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "mountId": "a-0-0",
          "mountOffset": [
            -30,
            85,
            90
          ]
        },
        {
          "machineId": "seed-zaku-phantom-blaze",
          "pilotId": "seed-rey",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "mountId": "a-0-0",
          "mountOffset": [
            -30,
            85,
            -90
          ]
        }
      ],
      "bForces": [
        {
          "machineId": "seed-spengler",
          "pilotId": "ship-crew",
          "stateId": "standard",
          "count": 2,
          "strategy": "objective"
        },
        {
          "machineId": "seed-danilov",
          "pilotId": "ship-crew",
          "stateId": "standard",
          "count": 2,
          "strategy": "objective"
        },
        {
          "machineId": "seed-zamza-zah",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 1,
          "strategy": "objective"
        },
        {
          "machineId": "seed-windam-jet",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 2,
          "strategy": "objective"
        },
        {
          "machineId": "seed-dagger-l-jet",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 2,
          "strategy": "screen"
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -9000,
          "y": 100,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -4200,
          "y": 1100,
          "z": 0
        },
        {
          "id": "a-2-0",
          "x": -9000,
          "y": 100,
          "z": 90
        },
        {
          "id": "a-3-0",
          "x": -9000,
          "y": 100,
          "z": -90
        },
        {
          "id": "b-0-0",
          "x": 9000,
          "y": 0,
          "z": -2500
        },
        {
          "id": "b-0-1",
          "x": 9000,
          "y": 0,
          "z": 2500
        },
        {
          "id": "b-1-0",
          "x": 6000,
          "y": 0,
          "z": -4500
        },
        {
          "id": "b-1-1",
          "x": 6000,
          "y": 0,
          "z": -1500
        },
        {
          "id": "b-2-0",
          "x": 2500,
          "y": 400,
          "z": 0
        },
        {
          "id": "b-3-0",
          "x": 2000,
          "y": 900,
          "z": -1350
        },
        {
          "id": "b-3-1",
          "x": 2000,
          "y": 900,
          "z": -450
        },
        {
          "id": "b-4-0",
          "x": 3800,
          "y": 700,
          "z": -1950
        },
        {
          "id": "b-4-1",
          "x": 3800,
          "y": 700,
          "z": -650
        }
      ]
    }
  },
  {
    "id": "ce-dardanelles",
    "name": "18 · SEED DESTINY · 达达尼尔三方交锋",
    "scenario": {
      "battlefieldId": "seed-sea",
      "missionId": "seed-threeway-breakout",
      "environmentId": "air",
      "distanceM": 14000,
      "altitudeM": 900,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-minerva",
          "pilotId": "seed-talia",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-force-impulse",
          "pilotId": "seed-shinn",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-saviour",
          "pilotId": "seed-athrun",
          "stateId": "period-2",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-zaku-phantom-blaze",
          "pilotId": "seed-rey",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "mountId": "a-0-0",
          "mountOffset": [
            -30,
            85,
            -90
          ]
        },
        {
          "machineId": "seed-zaku-warrior-gunner",
          "pilotId": "seed-luna",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "mountId": "a-0-0",
          "mountOffset": [
            -30,
            85,
            90
          ]
        },
        {
          "machineId": "seed-gouf",
          "pilotId": "seed-heine",
          "stateId": "period-1",
          "count": 1,
          "strategy": "screen"
        }
      ],
      "bForces": [
        {
          "machineId": "seed-takemikazuchi",
          "pilotId": "ship-crew",
          "stateId": "standard",
          "count": 1,
          "strategy": "objective"
        },
        {
          "machineId": "seed-orb-aegis",
          "pilotId": "ship-crew",
          "stateId": "standard",
          "count": 6,
          "strategy": "objective"
        },
        {
          "machineId": "seed-chaos",
          "pilotId": "seed-sting",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-abyss",
          "pilotId": "seed-auel",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-gaia",
          "pilotId": "seed-stella",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack",
          "mountId": "b-5-0",
          "mountOffset": [
            0,
            8,
            0
          ]
        },
        {
          "machineId": "seed-guul",
          "pilotId": "unmanned",
          "stateId": "automatic",
          "count": 1,
          "strategy": "simple"
        }
      ],
      "cForces": [
        {
          "machineId": "seed-freedom",
          "pilotId": "seed-kira",
          "stateId": "period-4",
          "count": 1,
          "strategy": "screen"
        },
        {
          "machineId": "seed-strike-rouge-ootori",
          "pilotId": "seed-cagalli",
          "stateId": "period-1",
          "count": 1,
          "strategy": "screen"
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -7000,
          "y": 100,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -3500,
          "y": 1000,
          "z": 700
        },
        {
          "id": "a-2-0",
          "x": -4000,
          "y": 1200,
          "z": -700
        },
        {
          "id": "a-3-0",
          "x": -7000,
          "y": 100,
          "z": -90
        },
        {
          "id": "a-4-0",
          "x": -7000,
          "y": 100,
          "z": 90
        },
        {
          "id": "a-5-0",
          "x": -3500,
          "y": 1100,
          "z": 0
        },
        {
          "id": "b-0-0",
          "x": 9000,
          "y": 0,
          "z": 0
        },
        {
          "id": "b-1-0",
          "x": 6500,
          "y": 0,
          "z": -4000
        },
        {
          "id": "b-1-1",
          "x": 6500,
          "y": 0,
          "z": -2400
        },
        {
          "id": "b-1-2",
          "x": 6500,
          "y": 0,
          "z": -800
        },
        {
          "id": "b-1-3",
          "x": 6500,
          "y": 0,
          "z": 800
        },
        {
          "id": "b-1-4",
          "x": 6500,
          "y": 0,
          "z": 2400
        },
        {
          "id": "b-1-5",
          "x": 6500,
          "y": 0,
          "z": 4000
        },
        {
          "id": "b-2-0",
          "x": 3200,
          "y": 1000,
          "z": -700
        },
        {
          "id": "b-3-0",
          "x": 3400,
          "y": -50,
          "z": 500
        },
        {
          "id": "b-4-0",
          "x": 3800,
          "y": 700,
          "z": 800
        },
        {
          "id": "b-5-0",
          "x": 3800,
          "y": 700,
          "z": 800
        },
        {
          "id": "c-0-0",
          "x": -500,
          "y": 1200,
          "z": 9000
        },
        {
          "id": "c-1-0",
          "x": -1200,
          "y": 1500,
          "z": 10500
        }
      ]
    }
  },
  {
    "id": "ce-crete",
    "name": "19 · SEED DESTINY · 克里特三方突围",
    "scenario": {
      "battlefieldId": "seed-sea",
      "missionId": "seed-threeway-breakout",
      "environmentId": "air",
      "distanceM": 14000,
      "altitudeM": 900,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-minerva",
          "pilotId": "seed-talia",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-blast-impulse",
          "pilotId": "seed-shinn",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-saviour",
          "pilotId": "seed-athrun",
          "stateId": "period-2",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-zaku-phantom-blaze",
          "pilotId": "seed-rey",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "mountId": "a-0-0",
          "mountOffset": [
            -30,
            85,
            -90
          ]
        },
        {
          "machineId": "seed-zaku-warrior-gunner",
          "pilotId": "seed-luna",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "mountId": "a-0-0",
          "mountOffset": [
            -30,
            85,
            90
          ]
        }
      ],
      "bForces": [
        {
          "machineId": "seed-takemikazuchi",
          "pilotId": "ship-crew",
          "stateId": "standard",
          "count": 1,
          "strategy": "objective"
        },
        {
          "machineId": "seed-orb-aegis",
          "pilotId": "ship-crew",
          "stateId": "standard",
          "count": 4,
          "strategy": "objective"
        },
        {
          "machineId": "seed-chaos",
          "pilotId": "seed-sting",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-abyss",
          "pilotId": "seed-auel",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-murasame",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 3,
          "strategy": "screen"
        }
      ],
      "cForces": [
        {
          "machineId": "seed-freedom",
          "pilotId": "seed-kira",
          "stateId": "period-4",
          "count": 1,
          "strategy": "screen"
        },
        {
          "machineId": "seed-strike-rouge-ootori",
          "pilotId": "seed-cagalli",
          "stateId": "period-1",
          "count": 1,
          "strategy": "screen"
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -7000,
          "y": 100,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -3700,
          "y": 900,
          "z": 300
        },
        {
          "id": "a-2-0",
          "x": -3600,
          "y": 1400,
          "z": -800
        },
        {
          "id": "a-3-0",
          "x": -7000,
          "y": 100,
          "z": -90
        },
        {
          "id": "a-4-0",
          "x": -7000,
          "y": 100,
          "z": 90
        },
        {
          "id": "b-0-0",
          "x": 9000,
          "y": 0,
          "z": 0
        },
        {
          "id": "b-1-0",
          "x": 6000,
          "y": 0,
          "z": -3300
        },
        {
          "id": "b-1-1",
          "x": 6000,
          "y": 0,
          "z": -1100
        },
        {
          "id": "b-1-2",
          "x": 6000,
          "y": 0,
          "z": 1100
        },
        {
          "id": "b-1-3",
          "x": 6000,
          "y": 0,
          "z": 3300
        },
        {
          "id": "b-2-0",
          "x": 2500,
          "y": 1100,
          "z": 500
        },
        {
          "id": "b-3-0",
          "x": 2000,
          "y": -80,
          "z": -800
        },
        {
          "id": "b-4-0",
          "x": 3200,
          "y": 1000,
          "z": -600
        },
        {
          "id": "b-4-1",
          "x": 3200,
          "y": 1000,
          "z": 0
        },
        {
          "id": "b-4-2",
          "x": 3200,
          "y": 1000,
          "z": 600
        },
        {
          "id": "c-0-0",
          "x": 0,
          "y": 1300,
          "z": 8500
        },
        {
          "id": "c-1-0",
          "x": -1500,
          "y": 1500,
          "z": 10000
        }
      ]
    }
  },
  {
    "id": "ce-angel-down",
    "name": "21 · SEED DESTINY · 大天使号追击脱离",
    "scenario": {
      "battlefieldId": "seed-sea",
      "missionId": "seed-submerge-escape",
      "environmentId": "air",
      "distanceM": 16000,
      "altitudeM": 800,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-archangel",
          "pilotId": "seed-murrue",
          "stateId": "period-2",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-freedom",
          "pilotId": "seed-kira",
          "stateId": "period-4",
          "count": 1,
          "strategy": "screen",
          "pilotOptions": {
            "skills": {
              "mercy-strike": true
            }
          }
        }
      ],
      "bForces": [
        {
          "machineId": "seed-minerva",
          "pilotId": "seed-talia",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective"
        },
        {
          "machineId": "seed-force-impulse",
          "pilotId": "seed-shinn",
          "stateId": "period-2",
          "count": 1,
          "strategy": "objective"
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -8000,
          "y": 140,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -1500,
          "y": 1100,
          "z": 0
        },
        {
          "id": "b-0-0",
          "x": 8000,
          "y": 1300,
          "z": 0
        },
        {
          "id": "b-1-0",
          "x": 1500,
          "y": 1100,
          "z": 0
        }
      ]
    }
  },
  {
    "id": "ce-eternal-rescue",
    "name": "23 · SEED DESTINY · 永恒号宇宙救援",
    "scenario": {
      "battlefieldId": "pursuit-space",
      "missionId": "seed-space-escape",
      "environmentId": "space",
      "distanceM": 40000,
      "altitudeM": 0,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-eternal",
          "pilotId": "seed-lacus",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-strike-freedom",
          "pilotId": "seed-kira",
          "stateId": "period-4",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-gaia",
          "pilotId": "seed-andrew",
          "stateId": "period-2",
          "count": 1,
          "strategy": "escort"
        }
      ],
      "bForces": [
        {
          "machineId": "seed-nazca",
          "pilotId": "ship-crew",
          "stateId": "standard",
          "count": 3,
          "strategy": "objective"
        },
        {
          "machineId": "seed-zaku-warrior-blaze",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 6,
          "strategy": "screen"
        },
        {
          "machineId": "seed-gouf",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 3,
          "strategy": "screen"
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -16000,
          "y": 0,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -2000,
          "y": 0,
          "z": 0
        },
        {
          "id": "a-2-0",
          "x": -10000,
          "y": 500,
          "z": 1000
        },
        {
          "id": "b-0-0",
          "x": 26000,
          "y": 0,
          "z": -1800
        },
        {
          "id": "b-0-1",
          "x": 26000,
          "y": 0,
          "z": 0
        },
        {
          "id": "b-0-2",
          "x": 26000,
          "y": 0,
          "z": 1800
        },
        {
          "id": "b-1-0",
          "x": 2000,
          "y": -500,
          "z": -1000
        },
        {
          "id": "b-1-1",
          "x": 2000,
          "y": 500,
          "z": -600
        },
        {
          "id": "b-1-2",
          "x": 2000,
          "y": -500,
          "z": -200
        },
        {
          "id": "b-1-3",
          "x": 2000,
          "y": 500,
          "z": 200
        },
        {
          "id": "b-1-4",
          "x": 2000,
          "y": -500,
          "z": 600
        },
        {
          "id": "b-1-5",
          "x": 2000,
          "y": 500,
          "z": 1000
        },
        {
          "id": "b-2-0",
          "x": 1000,
          "y": 500,
          "z": -600
        },
        {
          "id": "b-2-1",
          "x": 1000,
          "y": 500,
          "z": 0
        },
        {
          "id": "b-2-2",
          "x": 1000,
          "y": 500,
          "z": 600
        }
      ]
    }
  },
  {
    "id": "ce-orb-high-air",
    "name": "24 · SEED DESTINY · 奥布双机空域协防",
    "scenario": {
      "battlefieldId": "seed-sea",
      "missionId": "ce-orb-air-withdrawal",
      "environmentId": "air",
      "distanceM": 9000,
      "altitudeM": 1600,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-strike-freedom",
          "pilotId": "seed-kira",
          "stateId": "period-4",
          "count": 1,
          "strategy": "screen"
        },
        {
          "machineId": "seed-infinite-justice",
          "pilotId": "seed-athrun",
          "stateId": "period-2",
          "count": 1,
          "strategy": "screen"
        },
        {
          "machineId": "seed-akatsuki-owashi",
          "pilotId": "seed-mu",
          "stateId": "period-2",
          "count": 1,
          "strategy": "escort"
        }
      ],
      "bForces": [
        {
          "machineId": "seed-minerva",
          "pilotId": "seed-talia",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-destiny",
          "pilotId": "seed-shinn",
          "stateId": "period-2",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-legend",
          "pilotId": "seed-rey",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        }
      ]
    }
  },
  {
    "id": "ce-heliopolis-exterior",
    "name": "SEED · 殖民地外拦截",
    "scenario": {
      "battlefieldId": "seed-colony-exterior",
      "missionId": "ce-cgue-exterior-transit",
      "environmentId": "space",
      "distanceM": 1100,
      "altitudeM": 0,
      "focus": "overall",
      "mode": "auto",
      "maxSeconds": 180,
      "aForces": [
        {
          "machineId": "seed-mobius-zero",
          "pilotId": "seed-mu",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack",
          "initialState": {
            "velocity": [
              -285,
              0,
              0
            ],
            "forward": [
              1,
              0,
              0
            ]
          }
        }
      ],
      "bForces": [
        {
          "machineId": "seed-cgue",
          "pilotId": "seed-rau",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "velocity": [
              -380,
              0,
              0
            ],
            "forward": [
              -1,
              0,
              0
            ]
          }
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": 0,
          "y": 0,
          "z": 100
        },
        {
          "id": "b-0-0",
          "x": 1100,
          "y": 0,
          "z": 0
        }
      ]
    }
  },
  {
    "id": "ce-heliopolis-cgue",
    "name": "SEED · 西古突入与背包支援",
    "scenario": {
      "battlefieldId": "seed-heliopolis-cavity",
      "missionId": "ce-cgue-interception",
      "environmentId": "seed-colony-interior",
      "distanceM": 5000,
      "altitudeM": 600,
      "focus": "overall",
      "mode": "auto",
      "maxSeconds": 300,
      "aForces": [
        {
          "machineId": "seed-strike-field-packs",
          "pilotId": "seed-kira",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack",
          "pilotOptions": {
            "skills": {
              "seed-focus": false,
              "mercy-strike": false,
              "battle-os-adaptation": false
            }
          }
        },
        {
          "machineId": "seed-archangel-pack-support",
          "pilotId": "seed-murrue",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "initialState": {
            "weaponAmmo": {
              "w3-rail": 0,
              "w5-missile": 0
            }
          }
        },
        {
          "machineId": "seed-mobius-zero",
          "pilotId": "seed-mu",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "initialState": {
            "structureFraction": 0.9890594187011619,
            "armorFraction": 0.9326020054228055,
            "energyFraction": 1,
            "totalEnergyFraction": 0.9591240151939081,
            "stability": 0,
            "velocity": [
              -460.624397121738,
              8.383535961601037,
              184.54286088166634
            ],
            "forward": [
              -0.8253963565800205,
              0.1320944484590208,
              0.5488824202237987
            ],
            "componentHealth": {
              "cockpit": 1,
              "head": 1,
              "engine": 0.8176569783526989,
              "weapon-arm": 1,
              "power-system": 1,
              "mount-slot2": 1
            },
            "weaponAmmo": {
              "w1-linear": 79,
              "w2-gunbarrel": 192
            }
          }
        }
      ],
      "bForces": [
        {
          "machineId": "seed-cgue",
          "pilotId": "seed-rau",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "structureFraction": 0.9872454432837695,
            "armorFraction": 0.9220680759661553,
            "energyFraction": 1,
            "totalEnergyFraction": 0.9704302625839325,
            "stability": 1,
            "velocity": [
              -455.6334570666497,
              28.56418135294937,
              -107.72460132516144
            ],
            "forward": [
              -0.817117986991083,
              0.1477516681629388,
              -0.5572141777545769
            ],
            "componentHealth": {
              "cockpit": 1,
              "head": 1,
              "engine": 0.787424054729492,
              "weapon-arm": 1,
              "power-system": 1,
              "mount-slot2": 1
            },
            "weaponAmmo": {
              "w1-mg": 613,
              "w3-mg": 611
            }
          }
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -1000,
          "y": 600,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -4000,
          "y": 600,
          "z": 0
        },
        {
          "id": "a-2-0",
          "x": 2472.928599404824,
          "y": 1002.8600850989486,
          "z": 1656.4931692332707
        },
        {
          "id": "b-0-0",
          "x": 4000,
          "y": 600,
          "z": 0
        }
      ]
    }
  },
  {
    "id": "ce-heliopolis-collapse",
    "name": "SEED · 殖民地防卫与崩解",
    "scenario": {
      "battlefieldId": "seed-colony-damaged-cavity",
      "environmentId": "seed-colony-interior",
      "missionId": "ce-colony-defense-escape",
      "distanceM": 1300,
      "altitudeM": 0,
      "focus": "overall",
      "mode": "auto",
      "aForces": [
        {
          "machineId": "seed-archangel",
          "pilotId": "seed-murrue",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "structureFraction": 1,
            "armorFraction": 1,
            "energyFraction": 1,
            "totalEnergyFraction": 1,
            "velocity": [
              -100,
              0,
              0
            ],
            "forward": [
              -1,
              0,
              0
            ]
          }
        },
        {
          "machineId": "seed-sword-strike",
          "pilotId": "seed-kira",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort",
          "initialState": {
            "structureFraction": 1,
            "armorFraction": 1,
            "energyFraction": 1,
            "totalEnergyFraction": 1,
            "velocity": [
              0,
              0,
              0
            ]
          },
          "pilotOptions": {
            "skills": {
              "seed-focus": false,
              "mercy-strike": false,
              "battle-os-adaptation": false
            }
          }
        }
      ],
      "bForces": [
        {
          "machineId": "seed-ginn-d",
          "pilotId": "seed-miguel",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective",
          "initialState": {
            "structureFraction": 1,
            "armorFraction": 1,
            "energyFraction": 1,
            "totalEnergyFraction": 1,
            "velocity": [
              0,
              0,
              0
            ]
          }
        },
        {
          "machineId": "seed-aegis",
          "pilotId": "seed-athrun",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack",
          "initialState": {
            "structureFraction": 1,
            "armorFraction": 1,
            "energyFraction": 1,
            "totalEnergyFraction": 1,
            "velocity": [
              0,
              0,
              0
            ]
          },
          "pilotOptions": {
            "skills": {
              "seed-focus": false
            }
          }
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -5000,
          "y": 0,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": 0,
          "y": 0,
          "z": 100
        },
        {
          "id": "b-0-0",
          "x": 1300,
          "y": 0,
          "z": 0
        },
        {
          "id": "b-1-0",
          "x": 16000,
          "y": 1200,
          "z": 800
        }
      ]
    }
  },
  {
    "id": "ce-alaska-escape",
    "name": "08 · SEED · 阿拉斯加包围突围",
    "scenario": {
      "battlefieldId": "seed-sea",
      "environmentId": "sea-surface",
      "missionId": "annihilation",
      "distanceM": 6000,
      "altitudeM": 600,
      "focus": "overall",
      "mode": "auto",
      "maxSeconds": 480,
      "aForces": [
        {
          "machineId": "seed-archangel",
          "pilotId": "seed-murrue",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort"
        },
        {
          "machineId": "seed-freedom",
          "pilotId": "seed-kira",
          "stateId": "period-3",
          "count": 1,
          "strategy": "escort"
        }
      ],
      "bForces": [
        {
          "machineId": "seed-dinn",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 3,
          "strategy": "objective"
        },
        {
          "machineId": "seed-dinn",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 2,
          "strategy": "objective"
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -4500,
          "y": 350,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -1500,
          "y": 1100,
          "z": 0
        },
        {
          "id": "b-0-0",
          "x": 3500,
          "y": 600,
          "z": -600
        },
        {
          "id": "b-0-1",
          "x": 3500,
          "y": 600,
          "z": 0
        },
        {
          "id": "b-0-2",
          "x": 3500,
          "y": 600,
          "z": 600
        },
        {
          "id": "b-1-0",
          "x": 1500,
          "y": 800,
          "z": -600
        },
        {
          "id": "b-1-1",
          "x": 1500,
          "y": 800,
          "z": 600
        }
      ],
      "mission": {
        "kind": "mission",
        "id": "local-alaska",
        "name": "突破包围撤离（独眼巨人爆破不计入本局）",
        "victory": {
          "a": {
            "type": "reach",
            "entityId": "a-0-0",
            "point": [
              -16000,
              350,
              0
            ],
            "radiusM": 800
          },
          "b": {
            "type": "destroy",
            "entityId": "a-0-0"
          }
        },
        "priorities": {
          "a": {
            "primaryEntityId": "a-0-0",
            "primaryValue": 20
          },
          "b": {
            "primaryEntityId": "a-0-0",
            "primaryValue": 15
          }
        }
      }
    }
  },
  {
    "id": "ce-meteor-interception",
    "name": "10 · SEED · 流星核弹拦截",
    "scenario": {
      "battlefieldId": "pursuit-space",
      "environmentId": "space",
      "missionId": "annihilation",
      "distanceM": 6000,
      "altitudeM": 0,
      "focus": "overall",
      "mode": "auto",
      "maxSeconds": 480,
      "aForces": [
        {
          "machineId": "seed-freedom-meteor",
          "pilotId": "seed-kira",
          "stateId": "period-3",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-justice-meteor",
          "pilotId": "seed-athrun",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        }
      ],
      "bForces": [
        {
          "machineId": "seed-nuclear-warhead",
          "pilotId": "unmanned",
          "stateId": "automatic",
          "count": 8,
          "strategy": "simple",
          "initialState": {
            "velocity": [
              -600,
              0,
              0
            ],
            "forward": [
              -1,
              0,
              0
            ]
          }
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": 0,
          "y": 0,
          "z": -3000
        },
        {
          "id": "a-1-0",
          "x": 0,
          "y": 0,
          "z": 3000
        },
        {
          "id": "b-0-0",
          "x": 16000,
          "y": -800,
          "z": -5250
        },
        {
          "id": "b-0-1",
          "x": 16000,
          "y": 0,
          "z": -3750
        },
        {
          "id": "b-0-2",
          "x": 16000,
          "y": 800,
          "z": -2250
        },
        {
          "id": "b-0-3",
          "x": 16000,
          "y": -800,
          "z": -750
        },
        {
          "id": "b-0-4",
          "x": 16000,
          "y": 0,
          "z": 750
        },
        {
          "id": "b-0-5",
          "x": 16000,
          "y": 800,
          "z": 2250
        },
        {
          "id": "b-0-6",
          "x": 16000,
          "y": -800,
          "z": 3750
        },
        {
          "id": "b-0-7",
          "x": 16000,
          "y": 0,
          "z": 5250
        }
      ],
      "mission": {
        "kind": "mission",
        "id": "local-nuclear",
        "name": "拦截所有飞行核弹",
        "victory": {
          "a": {
            "type": "all",
            "conditions": [
              {
                "type": "destroy",
                "entityId": "b-0-0"
              },
              {
                "type": "destroy",
                "entityId": "b-0-1"
              },
              {
                "type": "destroy",
                "entityId": "b-0-2"
              },
              {
                "type": "destroy",
                "entityId": "b-0-3"
              },
              {
                "type": "destroy",
                "entityId": "b-0-4"
              },
              {
                "type": "destroy",
                "entityId": "b-0-5"
              },
              {
                "type": "destroy",
                "entityId": "b-0-6"
              },
              {
                "type": "destroy",
                "entityId": "b-0-7"
              }
            ]
          },
          "b": {
            "type": "any",
            "conditions": [
              {
                "type": "reach",
                "entityId": "b-0-0",
                "point": [
                  -9000,
                  0,
                  -5250
                ],
                "radiusM": 1300
              },
              {
                "type": "reach",
                "entityId": "b-0-1",
                "point": [
                  -9000,
                  0,
                  -3750
                ],
                "radiusM": 1300
              },
              {
                "type": "reach",
                "entityId": "b-0-2",
                "point": [
                  -9000,
                  0,
                  -2250
                ],
                "radiusM": 1300
              },
              {
                "type": "reach",
                "entityId": "b-0-3",
                "point": [
                  -9000,
                  0,
                  -750
                ],
                "radiusM": 1300
              },
              {
                "type": "reach",
                "entityId": "b-0-4",
                "point": [
                  -9000,
                  0,
                  750
                ],
                "radiusM": 1300
              },
              {
                "type": "reach",
                "entityId": "b-0-5",
                "point": [
                  -9000,
                  0,
                  2250
                ],
                "radiusM": 1300
              },
              {
                "type": "reach",
                "entityId": "b-0-6",
                "point": [
                  -9000,
                  0,
                  3750
                ],
                "radiusM": 1300
              },
              {
                "type": "reach",
                "entityId": "b-0-7",
                "point": [
                  -9000,
                  0,
                  5250
                ],
                "radiusM": 1300
              }
            ]
          }
        }
      }
    }
  },
  {
    "id": "ce-genesis-interior",
    "name": "13 · SEED · 创世纪内部破坏",
    "scenario": {
      "battlefieldId": "pursuit-space",
      "environmentId": "space",
      "missionId": "annihilation",
      "distanceM": 6000,
      "altitudeM": 0,
      "focus": "overall",
      "mode": "auto",
      "maxSeconds": 480,
      "aForces": [
        {
          "machineId": "seed-justice",
          "pilotId": "seed-athrun",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-strike-rouge",
          "pilotId": "seed-cagalli",
          "stateId": "period-1",
          "count": 1,
          "strategy": "escort"
        }
      ],
      "bForces": [
        {
          "machineId": "seed-genesis-core",
          "pilotId": "unmanned",
          "stateId": "automatic",
          "count": 1,
          "strategy": "simple"
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -5000,
          "y": 0,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -7500,
          "y": 300,
          "z": 300
        },
        {
          "id": "b-0-0",
          "x": 3000,
          "y": 0,
          "z": 0
        }
      ],
      "mission": {
        "kind": "mission",
        "id": "local-genesis",
        "name": "破坏内部核心（自爆载员撤离暂未覆盖）",
        "victory": {
          "a": {
            "type": "destroy",
            "entityId": "b-0-0"
          },
          "b": {
            "type": "timeout",
            "seconds": 240
          }
        },
        "priorities": {
          "a": {
            "primaryEntityId": "b-0-0",
            "primaryValue": 30
          }
        }
      }
    }
  },
  {
    "id": "ce-lohengrin-gate",
    "name": "17 · SEED DESTINY · 阳电子炮侧翼突破",
    "scenario": {
      "battlefieldId": "coastal",
      "environmentId": "air",
      "missionId": "annihilation",
      "distanceM": 6000,
      "altitudeM": 600,
      "focus": "overall",
      "mode": "auto",
      "maxSeconds": 480,
      "aForces": [
        {
          "machineId": "seed-minerva",
          "pilotId": "seed-talia",
          "stateId": "period-1",
          "count": 1,
          "strategy": "screen"
        },
        {
          "machineId": "seed-saviour",
          "pilotId": "seed-athrun",
          "stateId": "period-2",
          "count": 1,
          "strategy": "screen"
        },
        {
          "machineId": "seed-force-impulse",
          "pilotId": "seed-shinn",
          "stateId": "period-1",
          "count": 1,
          "strategy": "objective"
        }
      ],
      "bForces": [
        {
          "machineId": "seed-lohengrin-emplacement",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 1,
          "strategy": "objective"
        },
        {
          "machineId": "seed-gells-ghe",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 1,
          "strategy": "screen"
        },
        {
          "machineId": "seed-dagger-l",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 2,
          "strategy": "screen"
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -14000,
          "y": 500,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -5500,
          "y": 900,
          "z": 0
        },
        {
          "id": "a-2-0",
          "x": 4500,
          "y": 300,
          "z": 1800
        },
        {
          "id": "b-0-0",
          "x": 5000,
          "y": 0,
          "z": 0
        },
        {
          "id": "b-1-0",
          "x": 1600,
          "y": 0,
          "z": 0
        },
        {
          "id": "b-2-0",
          "x": 4500,
          "y": 0,
          "z": -1000
        },
        {
          "id": "b-2-1",
          "x": 4500,
          "y": 0,
          "z": 1000
        }
      ],
      "mission": {
        "kind": "mission",
        "id": "local-gate",
        "name": "正面牵制与侧翼击毁炮位",
        "victory": {
          "a": {
            "type": "destroy",
            "entityId": "b-0-0"
          },
          "b": {
            "type": "destroy",
            "entityId": "a-2-0"
          }
        },
        "priorities": {
          "a": {
            "primaryEntityId": "b-0-0",
            "primaryValue": 30
          },
          "b": {
            "primaryEntityId": "a-0-0",
            "primaryValue": 12
          }
        }
      }
    }
  },
  {
    "id": "ce-berlin",
    "name": "20 · SEED DESTINY · 柏林毁灭阻击",
    "scenario": {
      "battlefieldId": "coastal",
      "environmentId": "air",
      "missionId": "annihilation",
      "distanceM": 6000,
      "altitudeM": 600,
      "focus": "overall",
      "mode": "auto",
      "maxSeconds": 480,
      "aForces": [
        {
          "machineId": "seed-freedom",
          "pilotId": "seed-kira",
          "stateId": "period-4",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-force-impulse",
          "pilotId": "seed-shinn",
          "stateId": "period-2",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-strike-rouge",
          "pilotId": "seed-cagalli",
          "stateId": "period-2",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-murasame",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 3,
          "strategy": "attack"
        }
      ],
      "bForces": [
        {
          "machineId": "seed-destroy",
          "pilotId": "seed-stella",
          "stateId": "period-2",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-chaos",
          "pilotId": "seed-sting",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-windam-jet",
          "pilotId": "seed-mu",
          "stateId": "period-2",
          "count": 1,
          "strategy": "attack"
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -3000,
          "y": 400,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -6000,
          "y": 650,
          "z": 1200
        },
        {
          "id": "a-2-0",
          "x": -4500,
          "y": 700,
          "z": -1000
        },
        {
          "id": "a-3-0",
          "x": -2500,
          "y": 500,
          "z": 1800
        },
        {
          "id": "a-3-1",
          "x": -2500,
          "y": 500,
          "z": 2400
        },
        {
          "id": "a-3-2",
          "x": -2500,
          "y": 500,
          "z": 3000
        },
        {
          "id": "b-0-0",
          "x": 3500,
          "y": 0,
          "z": 0
        },
        {
          "id": "b-1-0",
          "x": 1800,
          "y": 800,
          "z": 2400
        },
        {
          "id": "b-2-0",
          "x": 2200,
          "y": 650,
          "z": -2400
        }
      ],
      "mission": {
        "kind": "mission",
        "id": "local-berlin",
        "name": "阻止毁灭高达继续进攻（对话及临时停战不计入）",
        "victory": {
          "a": {
            "type": "destroy",
            "entityId": "b-0-0"
          },
          "b": {
            "type": "eliminate",
            "side": "a"
          }
        }
      }
    }
  },
  {
    "id": "ce-heavens-base",
    "name": "22 · SEED DESTINY · 天堂基地毁灭部队阻击",
    "scenario": {
      "battlefieldId": "seed-land-base",
      "environmentId": "air",
      "missionId": "annihilation",
      "distanceM": 6000,
      "altitudeM": 600,
      "focus": "overall",
      "mode": "auto",
      "maxSeconds": 480,
      "aForces": [
        {
          "machineId": "seed-destiny",
          "pilotId": "seed-shinn",
          "stateId": "period-2",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-legend",
          "pilotId": "seed-rey",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-force-impulse",
          "pilotId": "seed-luna",
          "stateId": "period-2",
          "count": 1,
          "strategy": "attack"
        }
      ],
      "bForces": [
        {
          "machineId": "seed-destroy",
          "pilotId": "seed-sting",
          "stateId": "period-1",
          "count": 1,
          "strategy": "attack"
        },
        {
          "machineId": "seed-destroy",
          "pilotId": "elite-pilot",
          "stateId": "standard",
          "count": 4,
          "strategy": "attack"
        }
      ],
      "deployments": [
        {
          "id": "a-0-0",
          "x": -6000,
          "y": 800,
          "z": 0
        },
        {
          "id": "a-1-0",
          "x": -6500,
          "y": 900,
          "z": -1800
        },
        {
          "id": "a-2-0",
          "x": -6500,
          "y": 800,
          "z": 1800
        },
        {
          "id": "b-0-0",
          "x": 4000,
          "y": 0,
          "z": 0
        },
        {
          "id": "b-1-0",
          "x": 2000,
          "y": 0,
          "z": -3300
        },
        {
          "id": "b-1-1",
          "x": 4200,
          "y": 0,
          "z": -1100
        },
        {
          "id": "b-1-2",
          "x": 2000,
          "y": 0,
          "z": 1100
        },
        {
          "id": "b-1-3",
          "x": 4200,
          "y": 0,
          "z": 3300
        }
      ],
      "mission": {
        "kind": "mission",
        "id": "local-heavens",
        "name": "击破五台毁灭高达（高空炮与基地投降不计入）",
        "victory": {
          "a": {
            "type": "eliminate",
            "side": "b"
          },
          "b": {
            "type": "eliminate",
            "side": "a"
          }
        }
      }
    }
  }
];
