Rolladen Abschattungslogik:

Wunschtemperatur:
  Hier mus die für den Raum eingestellte Wunschtemperatur genommen werden (also der Default 20° oder 21°) 
  Abwesenheitsoffset oder Nachtoffset sind hier irrelevant

(x) Zustand egal
!Zustand -> Zustand false
===========+=================+============+==================+=============+====================+===================
Ausgang    |  Licht          | Nachtmodus |  Tag             | Direction   | Aussentemperatur - | Zielzustand
           |                 |            |                  | auf Fenster | Wunschtemperatur   |
           | (global,aussen) |            | (Sunrise/Sunset) | +/- 30°     |   > 6°             |
===========+=================+============+==================+=============+====================+===================
    x      |     x           |   true     |   x              |  x          |    x               | closed
-----------+-----------------+------------+------------------+-------------+--------------------+-------------------
    x      |     x           |   false    |  false           |  x          |    x               | closed
-----------+-----------------+------------+------------------+-------------+--------------------+-------------------
!manual,   |  <10000         |   false    |  true            |  x          |    x               | open
!heatblock |
-----------+-----------------+------------+------------------+-------------+--------------------+-------------------
!manual,   |  >30000         |   false    |  true            |  true       |    x               | sunblock
!heatblock |
-----------+-----------------+------------+------------------+-------------+--------------------+-------------------
!manual,   |  <20000         |   false    |  true            |  false      |    x               | open
!heatblock |
-----------+-----------------+------------+------------------+-------------+--------------------+-------------------
!manual    |  >30000         |   false    |  true            |  x          |    true            | heatblock
-----------+-----------------+------------+------------------+-------------+--------------------+-------------------
heatblock  |     x           |   false    |  true            |  false      |    false           | open
-----------+-----------------+------------+------------------+-------------+--------------------+-------------------
heatblock  |     x           |   false    |  true            |  true       |    false           | sunblock
              