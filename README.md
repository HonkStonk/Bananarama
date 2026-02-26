# Bananarama
Banana policy game

## Starta browser-versionen (Windows 11 / valfri webbläsare)

Öppna `banana_policy_game_web.html` direkt i en webbläsare (Chrome, Edge, Firefox, etc.).

Alternativt dubbelklicka på `run_web_game.bat`.

Om du föredrar lokal server:

```bat
python -m http.server 8000
```

Öppna sedan `http://localhost:8000/banana_policy_game_web.html`.

## Kontroller

- `A` / `D` eller `Vänster` / `Höger`: flytta bananvagnen
- `1`, `2`, `3`: leverera banan till kontor
- `Space`: leverera till kontoret med störst behov
- `R`: aktivera "rädda-banans" (kostar 2 lagerbananer, höjer hållbarhet)
- `M`: ljud av/på (browser-versionen)
- `Enter` / `Space`: starta / fortsätt mellan skärmar

Samma kontroller gäller för både Python- och browser-versionen.

## Mål

Fånga bananer, håll kontoren jämnt försörjda och försvara bananen som standardfrukt genom policyquiz mellan rundorna.
