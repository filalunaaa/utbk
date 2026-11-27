import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MIN_SAMPLE = 300;
const MIN_ITEMS = 10;
const MIN_ITEM_RESPONSES = 200;
const MIN_CATEGORY_COUNT = 30;
const MAX_ITERATIONS = 300;
const TOLERANCE = 1e-4;
const THETA_NODES = Array.from({ length: 61 }, (_, i) => -4.5 + i * 0.15);
const SQRT_2PI = Math.sqrt(2 * Math.PI);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sigmoid(z: number) {
  if (z > 35) return 1;
  if (z < -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

function logSumExp(values: number[]) {
  const max = Math.max(...values);
  if (!Number.isFinite(max)) return max;
  return max + Math.log(values.reduce((sum, value) => sum + Math.exp(value - max), 0));
}

function solve2(a: number, b: number, c: number, d: number, x: number, y: number) {
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [(d * x - b * y) / det, (a * y - c * x) / det] as const;
}

function makePrior() {
  const step = 0.15;
  const weights = THETA_NODES.map((theta) => Math.exp(-0.5 * theta * theta) / SQRT_2PI * step);
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / total);
}

function itemProbability(item: { a: number; b: number }, theta: number) {
  return sigmoid(item.a * (theta - item.b));
}

function posteriorForRow(
  row: Array<number | null>,
  items: Array<{ a: number; b: number }>,
  prior: number[],
) {
  const logs = THETA_NODES.map((theta, q) => {
    let value = Math.log(prior[q]);
    for (let i = 0; i < items.length; i++) {
      const response = row[i];
      if (response === null) continue;
      const p = Math.min(1 - 1e-12, Math.max(1e-12, itemProbability(items[i], theta)));
      value += response === 1 ? Math.log(p) : Math.log1p(-p);
    }
    return value;
  });
  const norm = logSumExp(logs);
  return logs.map((value) => Math.exp(value - norm));
}

function expectedCompleteLogLikelihood(
  responseCounts: number[],
  totalCounts: number[],
  intercept: number,
  slope: number,
) {
  let value = 0;
  for (let q = 0; q < THETA_NODES.length; q++) {
    const n = totalCounts[q];
    const r = responseCounts[q];
    if (n <= 1e-12) continue;
    const p = Math.min(1 - 1e-12, Math.max(1e-12, sigmoid(intercept + slope * THETA_NODES[q])));
    value += r * Math.log(p) + (n - r) * Math.log1p(-p);
  }
  return value;
}

function maximizeItem(
  responseCounts: number[],
  totalCounts: number[],
  initial: { a: number; b: number },
): { a: number; b: number; converged: boolean; iterations: number; reason?: string } {
  let slope = initial.a;
  let intercept = -initial.a * initial.b;
  let converged = false;
  let iterations = 0;
  let projectedGradient = Number.POSITIVE_INFINITY;

  for (let iteration = 0; iteration < 80; iteration++) {
    let g0 = 0, g1 = 0, i00 = 1e-8, i01 = 0, i11 = 1e-8;
    for (let q = 0; q < THETA_NODES.length; q++) {
      const n = totalCounts[q];
      if (n <= 1e-12) continue;
      const theta = THETA_NODES[q];
      const p = sigmoid(intercept + slope * theta);
      const variance = Math.max(1e-12, p * (1 - p));
      const residual = responseCounts[q] - n * p;
      g0 += residual;
      g1 += residual * theta;
      const info = n * variance;
      i00 += info;
      i01 += info * theta;
      i11 += info * theta * theta;
    }

    const projectedG0 =
      (intercept >= 20 - 1e-10 && g0 > 0) ||
      (intercept <= -20 + 1e-10 && g0 < 0) ? 0 : g0;
    const projectedG1 =
      (slope >= 5 - 1e-10 && g1 > 0) ||
      (slope <= 0.05 + 1e-10 && g1 < 0) ? 0 : g1;
    projectedGradient = Math.max(Math.abs(projectedG0), Math.abs(projectedG1));
    if (projectedGradient < 1e-6) {
      converged = true;
      iterations = iteration;
      break;
    }

    const delta = solve2(i00, i01, i01, i11, g0, g1);
    if (!delta) {
      return { a: slope, b: -intercept / slope, converged: false, iterations: iteration, reason: "singular_information" };
    }

    const currentQ = expectedCompleteLogLikelihood(responseCounts, totalCounts, intercept, slope);
    let accepted = false;
    let scale = 1;
    for (let lineSearch = 0; lineSearch < 24; lineSearch++, scale *= 0.5) {
      const nextIntercept = Math.max(-20, Math.min(20, intercept + scale * delta[0]));
      const nextSlope = Math.max(0.05, Math.min(5, slope + scale * delta[1]));
      if (nextIntercept === intercept && nextSlope === slope) continue;
      const candidateQ = expectedCompleteLogLikelihood(responseCounts, totalCounts, nextIntercept, nextSlope);
      if (Number.isFinite(candidateQ) && candidateQ >= currentQ - 1e-10) {
        intercept = nextIntercept;
        slope = nextSlope;
        accepted = true;
        break;
      }
    }

    iterations = iteration + 1;
    if (!accepted) {
      if (projectedGradient < 1e-5) {
        converged = true;
        break;
      }
      return { a: slope, b: -intercept / slope, converged: false, iterations, reason: "line_search_failed" };
    }
  }

  if (!converged) {
    let g0 = 0, g1 = 0;
    for (let q = 0; q < THETA_NODES.length; q++) {
      const n = totalCounts[q];
      if (n <= 1e-12) continue;
      const theta = THETA_NODES[q];
      const p = sigmoid(intercept + slope * theta);
      const residual = responseCounts[q] - n * p;
      g0 += residual;
      g1 += residual * theta;
    }
    const projectedG0 =
      (intercept >= 20 - 1e-10 && g0 > 0) ||
      (intercept <= -20 + 1e-10 && g0 < 0) ? 0 : g0;
    const projectedG1 =
      (slope >= 5 - 1e-10 && g1 > 0) ||
      (slope <= 0.05 + 1e-10 && g1 < 0) ? 0 : g1;
    projectedGradient = Math.max(Math.abs(projectedG0), Math.abs(projectedG1));
    converged = projectedGradient < 1e-5;
  }

  return {
    a: slope,
    b: -intercept / slope,
    converged,
    iterations,
    ...(converged ? {} : { reason: "inner_optimizer_not_converged" }),
  };
}



function isPositiveDefinite(matrix: number[][]) {
  const n=matrix.length,L=Array.from({length:n},()=>Array(n).fill(0));
  const scale=Math.max(...matrix.map((row,i)=>Math.abs(row[i])));
  if(!Number.isFinite(scale)||scale<=0)return false;
  for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
    let value=matrix[i][j];for(let k=0;k<j;k++)value-=L[i][k]*L[j][k];
    if(i===j){if(!Number.isFinite(value)||value<=scale*1e-12)return false;L[i][j]=Math.sqrt(value);}
    else L[i][j]=value/L[j][j];
  }
  return true;
}

function invertInformationMatrix(matrix: number[][]) {
  const n=matrix.length,a=matrix.map(row=>row.slice()),inverse=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0));
  const scale=Math.max(...a.map((row,i)=>Math.abs(row[i])));if(!Number.isFinite(scale)||scale<=0)return null;
  let minPivot=Number.POSITIVE_INFINITY;
  for(let col=0;col<n;col++){
    let pivotRow=col;for(let r=col+1;r<n;r++)if(Math.abs(a[r][col])>Math.abs(a[pivotRow][col]))pivotRow=r;
    const pivot=Math.abs(a[pivotRow][col]);if(!Number.isFinite(pivot)||pivot<scale*1e-12)return null;
    minPivot=Math.min(minPivot,pivot/scale);
    if(pivotRow!==col){[a[col],a[pivotRow]]=[a[pivotRow],a[col]];[inverse[col],inverse[pivotRow]]=[inverse[pivotRow],inverse[col]];}
    const divisor=a[col][col];for(let j=0;j<n;j++){a[col][j]/=divisor;inverse[col][j]/=divisor;}
    for(let r=0;r<n;r++){if(r===col)continue;const factor=a[r][col];if(!factor)continue;for(let j=0;j<n;j++){a[r][j]-=factor*a[col][j];inverse[r][j]-=factor*inverse[col][j];}}
  }
  return {inverse,minPivot};
}
function estimateJointObservedSE(rows:Array<Array<number|null>>,items:Array<{a:number;b:number}>,prior:number[]) {
  const itemCount=items.length,dimension=2*itemCount,work=rows.length*THETA_NODES.length*dimension*dimension;
  if(!itemCount)return {status:"unavailable",reason:"no_items",items:[] as any[]};
  if(dimension>80||work>80000000)return {status:"unavailable",reason:"computational_budget_exceeded",work,items:[] as any[]};
  const information=Array.from({length:dimension},()=>Array(dimension).fill(0));
  for(const row of rows){
    const weights=posteriorForRow(row,items,prior),meanScore=new Float64Array(dimension);
    const second=Array.from({length:dimension},()=>new Float64Array(dimension));
    for(let q=0;q<THETA_NODES.length;q++){
      const theta=THETA_NODES[q],weight=weights[q];if(weight<=0)continue;
      const score=new Float64Array(dimension);
      for(let j=0;j<itemCount;j++){
        const response=row[j];if(response===null)continue;
        const p=Math.min(1-1e-12,Math.max(1e-12,itemProbability(items[j],theta))),residual=response-p,x=2*j;
        score[x]=residual;score[x+1]=residual*theta;
        const h=weight*p*(1-p);
        information[x][x]+=h;information[x][x+1]+=h*theta;information[x+1][x]+=h*theta;information[x+1][x+1]+=h*theta*theta;
      }
      for(let i=0;i<dimension;i++){const si=score[i];meanScore[i]+=weight*si;if(si===0)continue;for(let k=0;k<dimension;k++)second[i][k]+=weight*si*score[k];}
    }
    for(let i=0;i<dimension;i++)for(let k=0;k<dimension;k++)information[i][k]-=second[i][k]-meanScore[i]*meanScore[k];
  }
  for(let i=0;i<dimension;i++)for(let k=i+1;k<dimension;k++){const v=(information[i][k]+information[k][i])/2;information[i][k]=v;information[k][i]=v;}
  if(!isPositiveDefinite(information))return {status:"unavailable",reason:"joint_observed_information_not_positive_definite",work,items:[] as any[]};
  const inverted=invertInformationMatrix(information);if(!inverted)return {status:"unavailable",reason:"joint_observed_information_singular",work,items:[] as any[]};
  const covariance=inverted.inverse;
  const estimates=items.map((item,j)=>{
    const c=2*j,d=c+1;if(item.a<=.050001||item.a>=4.999999||Math.abs(item.a*item.b)>=19.999)return {se_a:null,se_b:null,status:"boundary_parameter"};
    const varA=covariance[d][d],g0=-1/item.a,g1=-item.b/item.a;
    const varB=g0*g0*covariance[c][c]+2*g0*g1*covariance[c][d]+g1*g1*covariance[d][d];
    if(!Number.isFinite(varA)||!Number.isFinite(varB)||varA<=0||varB<=0)return {se_a:null,se_b:null,status:"non_positive_variance"};
    return {se_a:Math.sqrt(varA),se_b:Math.sqrt(varB),status:"computed"};
  });
  return {status:estimates.every(x=>x.status==="computed")?"computed":"partial",method:"louis_identity_full_joint_observed_information",
    parameterization:"intercept_slope",matrix_dimension:dimension,min_pivot_ratio:inverted.minPivot,work,items:estimates};
}

function calibrate2PL(rows: Array<Array<number | null>>, itemSummaries: any[]) {
  const prior = makePrior();
  const items = itemSummaries.map(() => ({ a: 1, b: 0 }));
  let converged = false;
  let logLikelihood = Number.NEGATIVE_INFINITY;
  let iterations = 0;
  let failure: string | null = null;

  const calculateLogLikelihood = (parameters: Array<{ a: number; b: number }>) =>
    rows.reduce((sum, row) => {
      const logs = THETA_NODES.map((theta, q) => {
        let value = Math.log(prior[q]);
        for (let i = 0; i < parameters.length; i++) {
          const response = row[i];
          if (response === null) continue;
          const p = Math.min(1 - 1e-12, Math.max(1e-12, itemProbability(parameters[i], theta)));
          value += response === 1 ? Math.log(p) : Math.log1p(-p);
        }
        return value;
      });
      return sum + logSumExp(logs);
    }, 0);

  logLikelihood = calculateLogLikelihood(items);

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const posteriorRows = rows.map((row) => posteriorForRow(row, items, prior));
    const nextItems = items.map((current, itemIndex) => {
      const responseCounts = Array(THETA_NODES.length).fill(0);
      const totalCounts = Array(THETA_NODES.length).fill(0);
      for (let r = 0; r < rows.length; r++) {
        const response = rows[r][itemIndex];
        if (response === null) continue;
        for (let q = 0; q < THETA_NODES.length; q++) {
          const weight = posteriorRows[r][q];
          totalCounts[q] += weight;
          if (response === 1) responseCounts[q] += weight;
        }
      }
      return maximizeItem(responseCounts, totalCounts, current);
    });

    const failedIndex = nextItems.findIndex((estimate) => !estimate.converged);
    if (failedIndex >= 0) {
      failure = "M-step butir ke-" + (failedIndex + 1) + " gagal: " +
        (nextItems[failedIndex].reason || "optimasi internal tidak konvergen");
      break;
    }

    const previousItems = items.map((item) => ({ ...item }));
    let maxChange = 0;
    for (let i = 0; i < items.length; i++) {
      maxChange = Math.max(
        maxChange,
        Math.abs(nextItems[i].a - items[i].a),
        Math.abs(nextItems[i].b - items[i].b),
      );
      items[i] = { a: nextItems[i].a, b: nextItems[i].b };
    }

    const nextLogLikelihood = calculateLogLikelihood(items);
    const logLikelihoodChange = nextLogLikelihood - logLikelihood;
    if (!Number.isFinite(nextLogLikelihood) || logLikelihoodChange < -1e-7) {
      for (let i = 0; i < items.length; i++) items[i] = previousItems[i];
      failure = "Log-likelihood observasi menurun; pembaruan EM dibatalkan.";
      break;
    }

    iterations = iteration;
    logLikelihood = nextLogLikelihood;
    const perResponseChange = Math.abs(logLikelihoodChange) / Math.max(1, rows.length);
    if (maxChange < TOLERANCE && perResponseChange < TOLERANCE) {
      converged = true;
      break;
    }
  }

  const standardErrors: any = converged ? estimateJointObservedSE(rows, items, prior) : { status: "not_computed_calibration_not_converged", items: [] as any[] };
  const diagnostics = items.map((item, index) => {
    const n = itemSummaries[index].n;
    const correct = itemSummaries[index].correct;
    const rate = n ? correct / n : null;
    const warnings: string[] = [];
    if (rate !== null && (rate < 0.05 || rate > 0.95)) warnings.push("proporsi_benar_ekstrem");
    if (item.a <= 0.051 || item.a >= 4.99) warnings.push("diskriminasi_mendekati_batas");
    if (item.b < -4.9 || item.b > 4.9) warnings.push("kesulitan_di_luar_rentang");
    const se = standardErrors.items[index];
    if (!se || se.status !== "computed") warnings.push("standard_error_tidak_tersedia" + (se?.status ? ":" + se.status : ""));
    return {
      itemId: itemSummaries[index].id,
      nomorSoal: itemSummaries[index].nomor_soal,
      a: Number(item.a.toFixed(6)),
      b: Number(item.b.toFixed(6)),
      se_a: se?.se_a === null || se?.se_a === undefined ? null : Number(se.se_a.toFixed(6)),
      se_b: se?.se_b === null || se?.se_b === undefined ? null : Number(se.se_b.toFixed(6)),
      n: itemSummaries[index].n,
      correct_rate: rate === null ? null : Number(rate.toFixed(6)),
      warnings,
    };
  });

  return { converged, iterations, logLikelihood, diagnostics, failure, standardErrors };
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Gunakan POST." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "Konfigurasi server belum lengkap." }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sesi login diperlukan." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Sesi login tidak valid." }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminRow, error: adminError } = await admin
    .from("admin_users").select("user_id").eq("user_id", authData.user.id).maybeSingle();
  if (adminError || !adminRow) return json({ error: "Akses khusus admin Pytago." }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Body JSON tidak valid." }, 400); }
  const packageId = String(body?.paket_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(packageId)) return json({ error: "ID paket tidak valid." }, 400);

  const { data: paket, error: packageError } = await admin
    .from("tryout_paket")
    .select("id,nama,irt_model,irt_status,irt_calibration_version")
    .eq("id", packageId).maybeSingle();
  if (packageError || !paket) return json({ error: "Paket tryout tidak ditemukan." }, 404);
  if (paket.irt_model !== "2PL") return json({ error: "Paket ini bukan model 2PL." }, 409);
  if (paket.irt_status === "sedang_dikalibrasi") return json({ error: "Kalibrasi paket sedang berjalan." }, 409);

  const { data: questionRows, error: questionError } = await admin
    .from("tryout_soal")
    .select("id,nomor_soal,tipe_soal,data")
    .eq("paket_id", packageId)
    .order("nomor_soal");
  if (questionError) return json({ error: "Gagal mengambil butir soal." }, 500);

  const eligible = (questionRows || []).flatMap((row: any) => {
    const data = typeof row.data === "string" ? JSON.parse(row.data) : (row.data || {});
    const type = String(data.tipe || row.tipe_soal || "").toLowerCase();
    if (type !== "pg" || !Number.isInteger(data.jawaban) || !Array.isArray(data.opsi) || data.opsi.length < 2) return [];
    return [{ id: row.id, nomor_soal: row.nomor_soal, key: data.jawaban, options: data.opsi.length }];
  });
  if (eligible.length < MIN_ITEMS) {
    return json({
      error: "Butir dikotomis pilihan ganda tidak cukup untuk kalibrasi 2PL.",
      eligible_items: eligible.length,
      minimum_items: MIN_ITEMS,
      excluded_items: (questionRows || []).length - eligible.length,
    }, 422);
  }

  const { data: attempts, error: attemptsError } = await admin
    .from("tryout_hasil")
    .select("id,user_id,jawaban,waktu_selesai,status")
    .eq("paket_id", packageId)
    .eq("status", "selesai")
    .order("waktu_selesai", { ascending: true });
  if (attemptsError) return json({ error: "Gagal mengambil respons peserta." }, 500);

  const firstAttemptByUser = new Map<string, any>();
  for (const attempt of attempts || []) {
    if (attempt.user_id && !firstAttemptByUser.has(attempt.user_id)) firstAttemptByUser.set(attempt.user_id, attempt);
  }
  const selectedAttempts = [...firstAttemptByUser.values()];
  const responseRows = selectedAttempts.map((attempt: any) =>
    eligible.map((item: any) => {
      const raw = attempt.jawaban?.[String(item.id)];
      if (raw === null || raw === undefined || raw === "") return null;
      const answer = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isInteger(answer) || answer < 0 || answer >= item.options) return null;
      return answer === item.key ? 1 : 0;
    })
  );

  const itemSummaries = eligible.map((item: any, index: number) => {
    const observed = responseRows.map((row: Array<number | null>) => row[index]).filter((v: number | null) => v !== null) as number[];
    const correct = observed.reduce((sum: number, value: number) => sum + value, 0);
    return { ...item, n: observed.length, correct, incorrect: observed.length - correct };
  });

  const sampleSize = selectedAttempts.length;
  const weakItems = itemSummaries.filter((item: any) =>
    item.n < Math.max(MIN_ITEM_RESPONSES, Math.ceil(sampleSize * 0.7)) ||
    item.correct < MIN_CATEGORY_COUNT || item.incorrect < MIN_CATEGORY_COUNT
  );

  const runInsert = await admin.from("tryout_irt_kalibrasi").insert({
    paket_id: packageId,
    model: "2PL",
    status: "berjalan",
    sample_size: sampleSize,
    item_count: eligible.length,
    estimator: "MML-EM",
    created_by: authData.user.id,
    started_at: new Date().toISOString(),
    metadata: {
      calibration_scope: "per_paket",
      response_selection: "percobaan_pertama_per_peserta",
      theta_prior: "N(0,1)",
      quadrature: { method: "normalized_equal_step_grid_including_endpoints", min: -4.5, max: 4.5, step: 0.15, includes_endpoints: true },
      eligible_item_ids: eligible.map((item: any) => item.id),
      excluded_item_count: (questionRows || []).length - eligible.length,
    },
  }).select("id").single();

  if (runInsert.error || !runInsert.data) return json({ error: "Gagal membuat catatan kalibrasi." }, 500);
  const runId = runInsert.data.id;

  if (sampleSize < MIN_SAMPLE || weakItems.length) {
    const reason = sampleSize < MIN_SAMPLE
      ? "Jumlah peserta unik belum mencapai ambang operasional."
      : "Sebagian butir belum memiliki variasi respons atau jumlah respons yang memadai.";
    await admin.from("tryout_irt_kalibrasi").update({
      status: "ditolak",
      error_message: reason,
      completed_at: new Date().toISOString(),
      metadata: {
        calibration_scope: "per_paket",
        response_selection: "percobaan_pertama_per_peserta",
        eligible_item_ids: eligible.map((item: any) => item.id),
        excluded_item_count: (questionRows || []).length - eligible.length,
        weak_items: weakItems.map((item: any) => ({
          nomor_soal: item.nomor_soal, n: item.n, correct: item.correct, incorrect: item.incorrect,
        })),
        minimum_sample: MIN_SAMPLE,
        minimum_item_responses: MIN_ITEM_RESPONSES,
        minimum_per_response_category: MIN_CATEGORY_COUNT,
      },
    }).eq("id", runId);
    const keepPreviousStatus = ["terkalibrasi", "perlu_tinjauan"].includes(paket.irt_status);
    await admin.from("tryout_paket").update({
      irt_status: keepPreviousStatus ? paket.irt_status : (sampleSize > 0 ? "mengumpulkan_data" : "belum_dikalibrasi"),
    }).eq("id", packageId);
    return json({
      ok: false,
      calibration_id: runId,
      status: "ditolak",
      message: reason,
      sample_size: sampleSize,
      minimum_sample: MIN_SAMPLE,
      eligible_items: eligible.length,
      weak_items: weakItems.map((item: any) => item.nomor_soal),
    }, 409);
  }

  const claim = await admin.from("tryout_paket")
    .update({ irt_status: "sedang_dikalibrasi" })
    .eq("id", packageId)
    .neq("irt_status", "sedang_dikalibrasi")
    .select("id")
    .maybeSingle();

  if (claim.error || !claim.data) {
    await admin.from("tryout_irt_kalibrasi").update({
      status: "ditolak",
      error_message: "Paket sedang dikalibrasi oleh proses lain.",
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    return json({ error: "Paket sedang dikalibrasi oleh proses lain." }, 409);
  }

  try {
    const result = calibrate2PL(responseRows, itemSummaries);
    if (!result.converged) throw new Error(result.failure || "Algoritma EM belum mencapai konvergensi.");

    const warnings = result.diagnostics.flatMap((item: any) =>
      item.warnings.map((warning: string) => ({ nomor_soal: item.nomorSoal, warning }))
    );
    // Estimasi parameter sudah tersedia, tetapi belum boleh dinyatakan final
    // sebelum statistik kecocokan butir (item-fit) ditambahkan dan ditinjau.
    warnings.push({ nomor_soal: null, warning: "model_fit_belum_diuji" });
    const finalStatus = "perlu_tinjauan";

    const metadata = {
      calibration_scope: "per_paket",
      response_selection: "percobaan_pertama_per_peserta",
      theta_prior: "N(0,1)",
      estimator: "MML-EM",
      quadrature: { method: "normalized_equal_step_grid_including_endpoints", min: -4.5, max: 4.5, step: 0.15, nodes: THETA_NODES.length, includes_endpoints: true },
      convergence_tolerance: TOLERANCE,
      max_iterations: MAX_ITERATIONS,
      log_likelihood: result.logLikelihood,
      warnings,
      model_fit_assessment: "not_assessed",
      standard_error_method: result.standardErrors.method || result.standardErrors.status,
      standard_error_interpretation: "asymptotic_model_based_conditional_on_2PL",
      standard_error_diagnostics: { status: result.standardErrors.status, reason: result.standardErrors.reason || null,
        matrix_dimension: result.standardErrors.matrix_dimension || null, min_pivot_ratio: result.standardErrors.min_pivot_ratio || null,
        computational_work: result.standardErrors.work || null },
      excluded_item_count: (questionRows || []).length - eligible.length,
      items: result.diagnostics,
    };

    const { error: persistError } = await admin.rpc("persist_irt_2pl_calibration", {
      p_calibration_id: runId,
      p_package_id: packageId,
      p_items: result.diagnostics.map((item: any) => ({
        item_id: item.itemId,
        a: item.a,
        b: item.b,
      })),
      p_sample_size: sampleSize,
      p_iterations: result.iterations,
      p_log_likelihood: result.logLikelihood,
      p_metadata: metadata,
    });
    if (persistError) throw new Error("Penyimpanan parameter secara atomik gagal: " + persistError.message);

    return json({
      ok: true,
      calibration_id: runId,
      status: finalStatus,
      model: "2PL",
      estimator: "MML-EM",
      sample_size: sampleSize,
      calibrated_items: result.diagnostics.length,
      excluded_items: (questionRows || []).length - eligible.length,
      iterations: result.iterations,
      log_likelihood: result.logLikelihood,
      warnings,
      items: result.diagnostics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kalibrasi gagal.";
    await admin.from("tryout_irt_kalibrasi").update({
      status: "gagal",
      convergence: false,
      error_message: message,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    const keepPreviousStatus = ["terkalibrasi", "perlu_tinjauan"].includes(paket.irt_status);
    await admin.from("tryout_paket").update({
      irt_status: keepPreviousStatus ? paket.irt_status : "gagal",
    }).eq("id", packageId);
    return json({ error: message, calibration_id: runId }, 500);
  }
});