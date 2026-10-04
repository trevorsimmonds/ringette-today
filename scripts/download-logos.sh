#!/bin/bash
# Downloads every club logo used by Ringette Today into the logos/ folder,
# with clean file names (e.g. logos/west-ottawa-wild.jpg).
# Run from anywhere:  bash ~/Projects/ringette-today/scripts/download-logos.sh
# The list of clubs, logo sources and which team names each one is for is in
# logos/logos.json.
cd "$(dirname "$0")/.." || exit 1
mkdir -p logos
ok=0; fail=0
get() {
  if curl -fsSL --max-time 30 -o "logos/$1" "$2"; then ok=$((ok+1)); printf '  ✓ %s\n' "$1"
  else fail=$((fail+1)); printf '  ✗ %s  (%s)\n' "$1" "$2"; fi
}
echo "Downloading club logos into $(pwd)/logos …"
get arnprior-devils.jpg                      "https://www.ncrrl.com/cloud/NationalCapitalRegionRingetteLeague/images/amra.jpg"
get clarence-rockland-falcons.jpg            "https://www.ncrrl.com/cloud/NationalCapitalRegionRingetteLeague/images/images.jpg"
get gatineau.jpg                             "https://www.ncrrl.com/cloud/NationalCapitalRegionRingetteLeague/images/arg_logo.jpg"
get gloucester-cumberland-devils.jpg         "https://www.ncrrl.com/cloud/NationalCapitalRegionRingetteLeague/images/gloucester_ringette_ah26_mockup222.jpg"
get kingston-panthers.jpg                    "https://www.ncrrl.com/cloud/NationalCapitalRegionRingetteLeague/images/kra.jpg"
get metcalfe-hornets.jpg                     "https://www.ncrrl.com/cloud/NationalCapitalRegionRingetteLeague/images/newlogomdra.jpg"
get nepean-ravens.png                        "https://www.ncrrl.com/cloud/NationalCapitalRegionRingetteLeague/images/nepean-ringette-logo.png"
get ottawa-ice.jpg                           "https://www.ncrrl.com/cloud/NationalCapitalRegionRingetteLeague/images/cora-lg.jpg"
get upper-ottawa-valley.jpg                  "https://www.ncrrl.com/cloud/NationalCapitalRegionRingetteLeague/images/uov-lg.jpg"
get west-ottawa-wild.jpg                     "https://www.ncrrl.com/cloud/NationalCapitalRegionRingetteLeague/images/wora.jpg"
get eastern-ontario-aa.jpg                   "https://www.ncrrl.com/cloud/NationalCapitalRegionRingetteLeague/files/EasternOntarioAA_160.jpg"
get lerq-outaouais.webp                      "https://ringuette-quebec.qc.ca/wp-content/uploads/2025/07/rq-association-outaouais.webp"
get lerq-lac-st-louis.webp                   "https://ringuette-quebec.qc.ca/wp-content/uploads/2025/07/rq-association-lac-stlouis.webp"
get lerq-quebec.webp                         "https://ringuette-quebec.qc.ca/wp-content/uploads/2025/07/rq-association-quebec.webp"
get lerq-laurentides.webp                    "https://ringuette-quebec.qc.ca/wp-content/uploads/2025/07/rq-association-laurentides.webp"
get lerq-rive-sud.webp                       "https://ringuette-quebec.qc.ca/wp-content/uploads/2025/07/rq-association-rive-sud.webp"
get lerq-bll.webp                            "https://ringuette-quebec.qc.ca/wp-content/uploads/2025/06/rq-regionale-bll-1.webp"
get gaara.svg                                "https://cloud3.rampinteractive.com/gaara/css/img/assocLogo.svg"
get ajax-pickering-power.svg                 "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Ajax%20Pickering%20Power.svg"
get barrie-blizzard.svg                      "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Barrie%20Blizzard.svg"
get burlington-blast.png                     "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Burlington%20Blast.png"
get caledonia-lightning.svg                  "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Caledonia%20Lightning.svg"
get cambridge-turbos.svg                     "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Cambridge%20Turbos.svg"
get chatham-thunder.svg                      "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Chatham%20Thunder.svg"
get dorchester-dragons.svg                   "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Dorchester%20Dragons.svg"
get elora-fergus-edge.svg                    "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Elora%20Fergus%20Edge.svg"
get etobicoke-stingers.svg                   "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Etobicoke%20Stingers.svg"
get forest-xtreme.svg                        "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Forest%20Xtreme.svg"
get goderich-ice-crushers.svg                "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Goderich%20Ice%20Crushers.svg"
get greater-sudbury-north-stars.jpg          "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Greater%20Sudbury%20North%20Stars.jpg"
get guelph-predators.svg                     "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Guelph%20Predators.svg"
get hamilton-heat.svg                        "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Hamilton%20Heat.svg"
get kitchener-wildcats.svg                   "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Kitchener%20Wildcats.svg"
get london-lynx.svg                          "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20London%20Lynx.svg"
get manvers-mountain-cats.svg                "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Manvers%20Mountain%20Cats.svg"
get markham-stouffville-bears.svg            "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Markham%20Stouffville%20Bears.svg"
get mississauga-mustangs.svg                 "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Mississauga%20Mustangs.svg"
get mitchell-stingers.svg                    "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Mitchell%20Stingers.svg"
get muskoka-royals.svg                       "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Muskoka%20Royals.svg"
get newmarket-rays.svg                       "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Newmarket%20Rays_Resized.svg"
get niagara-falls-daredevils.svg             "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Niagara%20Falls%20Daredevils.svg"
get oshawa-storm.svg                         "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Oshawa%20Storm.svg"
get paris-thunder.svg                        "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Paris%20Thunder.svg"
get richmond-hill-lightning.svg              "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Richmond%20Hill%20Lightning.svg"
get st-catharines-comets.svg                 "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20St%20Catharines%20Comets.svg"
get st-marys-snipers.svg                     "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20St%20Marys%20Snipers.svg"
get st-thomas-thunder.svg                    "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20St%20Thomas%20Thunder.svg"
get sunderland-stingerz.svg                  "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Sunderland%20Stingerz.svg"
get tillsonburg-twisters.svg                 "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Tillsonburg%20Twisters.svg"
get waterloo-wildfire.svg                    "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Waterloo%20Wildfire.svg"
get wellington-north-ice-ninjas.jpg          "https://cloud3.rampinteractive.com/lorl/images/LOGOS/Wellington%20North%20Ice%20Ninjas.jpg"
get whitby-wild.svg                          "https://cloud3.rampinteractive.com/lorl/images/LOGOS/LOGO%20-%20Whitby%20Wild.svg"
echo
echo "Done: $ok saved, $fail failed."
