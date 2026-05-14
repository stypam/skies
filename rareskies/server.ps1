$OPENSKY_USER = 'mast2137-api-client'
$OPENSKY_PASS = 'JVdFENxMS07hHYRK0NFIjI2ViKzgBU9K'
$CLAUDE_KEY   = 'WKLEJ_TUTAJ_KLUCZ_CLAUDE'
$PORT         = 7979
$ROOT         = Split-Path -Parent $MyInvocation.MyCommand.Path
$OS_CACHE     = $null
$OS_CACHE_TS  = [DateTime]::MinValue

function SJson($res,$body,$status){
    $b=$([System.Text.Encoding]::UTF8.GetBytes($body))
    $res.StatusCode=$status
    $res.ContentType='application/json; charset=utf-8'
    $res.ContentLength64=$b.Length
    $res.Headers['Access-Control-Allow-Origin']='*'
    $res.OutputStream.Write($b,0,$b.Length)
    $res.Close()
}
function SFile($res,$fp){
    $b=[System.IO.File]::ReadAllBytes($fp)
    $ext=[System.IO.Path]::GetExtension($fp)
    $m='application/octet-stream'
    if($ext -eq '.html'){$m='text/html; charset=utf-8'}
    if($ext -eq '.css') {$m='text/css'}
    if($ext -eq '.js')  {$m='application/javascript'}
    $res.ContentType=$m
    $res.ContentLength64=$b.Length
    $res.Headers['Access-Control-Allow-Origin']='*'
    $res.OutputStream.Write($b,0,$b.Length)
    $res.Close()
}

$listener=New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$PORT/")
$listener.Start()
Write-Host "RareSkies: http://localhost:$PORT  (Ctrl+C aby zatrzymac)"

while($listener.IsListening){
    $ctx=$listener.GetContext()
    $req=$ctx.Request
    $res=$ctx.Response
    $path=$req.Url.LocalPath.TrimStart('/')
    $ts=Get-Date -Format 'HH:mm:ss'

    if($req.HttpMethod -eq 'OPTIONS'){
        $res.StatusCode=204
        $res.Headers['Access-Control-Allow-Origin']='*'
        $res.Headers['Access-Control-Allow-Methods']='GET,POST,OPTIONS'
        $res.Headers['Access-Control-Allow-Headers']='*'
        $res.Close()
        continue
    }

    if($path -eq 'api/states'){
        $age=([DateTime]::Now - $OS_CACHE_TS).TotalSeconds
        if($OS_CACHE -and ($age -lt 35)){
            Write-Host "$ts [OpenSky] Cache ${age}s"
            SJson $res $OS_CACHE 200
        } else {
            Write-Host "$ts [OpenSky] Pobieranie..."
            $wc=New-Object System.Net.WebClient
            $enc=[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($OPENSKY_USER+':'+$OPENSKY_PASS))
            $wc.Headers['Authorization']='Basic '+$enc
            $ok=$false
            try{
                $data=$wc.DownloadData('https://opensky-network.org/api/states/all')
                $json=[System.Text.Encoding]::UTF8.GetString($data)
                $script:OS_CACHE=$json
                $script:OS_CACHE_TS=[DateTime]::Now
                $cnt=($json|ConvertFrom-Json).states.Count
                Write-Host "$ts [OpenSky] OK $cnt samolotow"
                SJson $res $json 200
                $ok=$true
            } catch {
                Write-Host "$ts [OpenSky] ERR $($_.Exception.Message)"
            }
            if(-not $ok){
                if($null -ne $OS_CACHE){ SJson $res $OS_CACHE 200 }
                else { SJson $res '{"error":"OpenSky blad"}' 502 }
            }
        }
    } elseif ($path -eq 'api/flights') {

        $icao = $req.QueryString['icao24']
        if (-not $icao) {
            SJson $res '[]' 200
        } else {
            $end = [Math]::Floor([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
            $beg = $end - (14 * 24 * 3600) # Ostatnie 14 dni
            Write-Host "$ts [Flights] Pobieranie historii $icao"
            $wc = New-Object System.Net.WebClient
            $enc = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("${OPENSKY_USER}:${OPENSKY_PASS}"))
            $wc.Headers['Authorization'] = "Basic $enc"
            try {
                $url  = "https://opensky-network.org/api/flights/aircraft?icao24=$icao&begin=$beg&end=$end"
                $data = $wc.DownloadData($url)
                $json = [System.Text.Encoding]::UTF8.GetString($data)
                $arr  = $json | ConvertFrom-Json
                if ($null -eq $arr) {
                    SJson $res '[]' 200
                } else {
                    $sorted = @($arr | Sort-Object firstSeen -Descending)
                    $top3   = $sorted | Select-Object -First 3
                    $result = $top3 | ConvertTo-Json -Compress -Depth 5
                    if (-not $result) { $result = '[]' }
                    SJson $res $result 200
                }
            } catch {
                Write-Host "$ts [Flights] ERR: $($_.Exception.Message)"
                SJson $res '[]' 502
            }
        }

    } elseif($path -eq 'api/ai'){
        $qt=$req.QueryString['type']
        $qc=$req.QueryString['country']
        $qalt=$req.QueryString['alt']
        $qspd=$req.QueryString['spd']
        $qhdg=$req.QueryString['hdg']
        $qvr=$req.QueryString['vr']
        if(-not $qt){$qt=''}
        if(-not $qc){$qc=''}
        $tp=[Uri]::UnescapeDataString($qt)
        $co=[Uri]::UnescapeDataString($qc)
        $alt=[Uri]::UnescapeDataString($qalt)
        $spd=[Uri]::UnescapeDataString($qspd)
        $hdg=[Uri]::UnescapeDataString($qhdg)
        $vr=[Uri]::UnescapeDataString($qvr)
        Write-Host "$ts [Claude] $tp / $co / alt:$alt spd:$spd hdg:$hdg vr:$vr"
        if($CLAUDE_KEY -eq 'WKLEJ_TUTAJ_KLUCZ_CLAUDE' -or $CLAUDE_KEY -eq ''){
            SJson $res '{"text":null}' 200
        } else {
            $telemetry="Wysokosc:$alt m, Predkosc:$spd km/h, Predkosc pionowa:$vr m/s, Kierunek:$hdg st."
            $pr='Napisz 3-4 fascynujace zdania po polsku o maszynie '+$tp+' z '+$co+'. Najpierw krotko przypomnij do czego powstal ten sprzet, a nastepnie na podstawie danych lotu ('+$telemetry+') sprobuj zabawnie lub zwiadowczo odgadnac co on TERAZ robi na niebie (np. wznosi sie dynamicznie, zrzuca zop/ladunek, tankuje, patroluje powoli na niskim pulapie, pedzi w misji przechwytujacej). Uzyj fajnego, wywiadowczego stylu!'
            $bo='{"model":"claude-3-haiku-20240307","max_tokens":350,"messages":[{"role":"user","content":"'+$pr+'"}]}'
            $wc2=New-Object System.Net.WebClient
            $wc2.Headers['x-api-key']=$CLAUDE_KEY
            $wc2.Headers['anthropic-version']='2023-06-01'
            $wc2.Headers['content-type']='application/json'
            $ok2=$false
            try{
                $rsp=$wc2.UploadString('https://api.anthropic.com/v1/messages','POST',$bo)
                $txt=($rsp|ConvertFrom-Json).content[0].text
                $txt=$txt -replace '"','\"' -replace "`n",' ' -replace "`r",''
                SJson $res ('{"text":"'+$txt+'"}') 200
                $ok2=$true
                Write-Host "$ts [Claude] OK"
            } catch {
                Write-Host "$ts [Claude] ERR $($_.Exception.Message)"
            }
            if(-not $ok2){ SJson $res '{"text":null}' 200 }
        }
    } else {
        if($path -eq '' -or $path -eq 'index.html'){$path='index.html'}
        $file=Join-Path $ROOT $path
        if(Test-Path $file){
            Write-Host "$ts [File] $path"
            SFile $res $file
        } else {
            $b=[System.Text.Encoding]::UTF8.GetBytes('404')
            $res.StatusCode=404
            $res.ContentLength64=$b.Length
            $res.OutputStream.Write($b,0,$b.Length)
            $res.Close()
        }
    }
}
