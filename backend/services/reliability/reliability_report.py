"""
Reliability Report Generator
信度报告生成模块

生成编码者间信度分析的详细HTML报告。
"""

import datetime
from typing import Dict, Any, Optional


def get_interpretation_color(value: float) -> str:
    """根据系数值返回对应的颜色"""
    if value >= 0.8:
        return '#27ae60'  # 几乎完美
    if value >= 0.6:
        return '#2ecc71'  # 实质性
    if value >= 0.4:
        return '#f1c40f'  # 中等
    if value >= 0.2:
        return '#e67e22'  # 一般
    if value >= 0.0:
        return '#e74c3c'  # 轻微
    return '#c0392b'  # 差于偶然


def generate_detailed_report(
    results: Dict[str, Any],
    data_summary: Optional[Dict[str, Any]] = None
) -> str:
    """
    生成详细的HTML报告
    
    Args:
        results: 计算结果字典
        data_summary: 数据摘要（可选）
        
    Returns:
        HTML 报告字符串
    """
    current_time = datetime.datetime.now().strftime("%Y年%m月%d日 %H:%M:%S")
    
    # 统计成功计算的系数数量
    calculated_count = len([r for r in results.values() if r.get('calculated', False)])
    
    # 数据摘要信息
    coder_count = data_summary.get('coder_count', 'N/A') if data_summary else 'N/A'
    annotation_count = data_summary.get('total_annotations', 'N/A') if data_summary else 'N/A'
    framework = data_summary.get('framework', 'N/A') if data_summary else 'N/A'
    
    # 提取各系数
    percent_agreement = results.get('percent_agreement', {})
    fleiss_kappa = results.get('fleiss_kappa', {})
    cohens_kappa = results.get('cohens_kappa', {})
    krippendorff_alpha = results.get('krippendorff_alpha', {})
    precision_recall = results.get('precision_recall', {})
    
    # 构建HTML报告
    html_content = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>编码者间信度分析报告</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            min-height: 100vh;
            padding: 40px 20px;
        }}
        .container {{
            max-width: 900px;
            margin: 0 auto;
            background-color: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
        }}
        .header {{
            background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
            color: white;
            padding: 30px 40px;
            text-align: center;
        }}
        .header h1 {{
            font-size: 1.8em;
            font-weight: 600;
            margin-bottom: 8px;
        }}
        .header .subtitle {{
            opacity: 0.9;
            font-size: 0.95em;
        }}
        .content {{
            padding: 30px 40px;
        }}
        .overview-grid {{
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-bottom: 30px;
        }}
        .overview-card {{
            background: #f8f9fa;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            border: 1px solid #e9ecef;
        }}
        .overview-card .label {{
            color: #6c757d;
            font-size: 0.85em;
            margin-bottom: 8px;
        }}
        .overview-card .value {{
            color: #1976d2;
            font-size: 1.8em;
            font-weight: 700;
        }}
        .section {{
            margin-bottom: 25px;
        }}
        .section-title {{
            background: #1976d2;
            color: white;
            padding: 12px 20px;
            border-radius: 8px 8px 0 0;
            font-weight: 600;
            font-size: 1em;
        }}
        .section-content {{
            border: 1px solid #dee2e6;
            border-top: none;
            border-radius: 0 0 8px 8px;
            overflow: hidden;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
        }}
        th, td {{
            padding: 14px 16px;
            text-align: left;
            border-bottom: 1px solid #e9ecef;
        }}
        th {{
            background: #f8f9fa;
            font-weight: 600;
            color: #495057;
            font-size: 0.9em;
        }}
        td {{
            font-size: 0.95em;
        }}
        tr:last-child td {{
            border-bottom: none;
        }}
        .value-cell {{
            font-weight: 700;
            font-size: 1.1em;
        }}
        .pairwise-table {{
            margin-top: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
        }}
        .pairwise-table h4 {{
            color: #495057;
            font-size: 0.9em;
            margin-bottom: 10px;
        }}
        .pairwise-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 10px;
        }}
        .pairwise-item {{
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            padding: 10px;
            text-align: center;
        }}
        .pairwise-item .pair-name {{
            color: #6c757d;
            font-size: 0.8em;
            margin-bottom: 4px;
        }}
        .pairwise-item .pair-value {{
            font-weight: 600;
            font-size: 1em;
        }}
        .interpretation-box {{
            background: #f8f9fa;
            border-radius: 12px;
            padding: 20px;
            margin-top: 25px;
        }}
        .interpretation-box h3 {{
            color: #495057;
            font-size: 1em;
            margin-bottom: 15px;
        }}
        .interpretation-grid {{
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
        }}
        .interpretation-item {{
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            background: white;
            border-radius: 6px;
            border: 1px solid #e9ecef;
        }}
        .interpretation-item .color-dot {{
            width: 12px;
            height: 12px;
            border-radius: 50%;
            flex-shrink: 0;
        }}
        .interpretation-item .range {{
            font-weight: 600;
            color: #495057;
            min-width: 70px;
        }}
        .interpretation-item .desc {{
            color: #6c757d;
            font-size: 0.9em;
        }}
        .footer {{
            background: #f8f9fa;
            padding: 20px 40px;
            text-align: center;
            border-top: 1px solid #e9ecef;
        }}
        .footer p {{
            color: #6c757d;
            font-size: 0.85em;
            margin: 4px 0;
        }}
        .error-text {{
            color: #dc3545;
            font-style: italic;
        }}
        .framework-info {{
            background: #e3f2fd;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        .framework-info .label {{
            color: #1976d2;
            font-weight: 600;
        }}
        .framework-info .value {{
            color: #495057;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
        <h1>编码者间信度分析报告</h1>
            <div class="subtitle">Inter-Coder Reliability Analysis Report</div>
        </div>
        
        <div class="content">
            <!-- 数据概览 -->
            <div class="overview-grid">
                <div class="overview-card">
                    <div class="label">编码者数量 / N Coders</div>
                    <div class="value">{coder_count}</div>
                </div>
                <div class="overview-card">
                    <div class="label">标注总数 / Annotations</div>
                    <div class="value">{annotation_count}</div>
                </div>
                <div class="overview-card">
                    <div class="label">计算系数 / Coefficients</div>
                    <div class="value">{calculated_count}</div>
                </div>
            </div>
            
            <div class="framework-info">
                <span class="label">标注框架:</span>
                <span class="value">{framework}</span>
        </div>
'''
    
    # Average Pairwise Percent Agreement
    if percent_agreement.get('calculated'):
        pa_value = percent_agreement.get('value', 0)
        pa_color = get_interpretation_color(pa_value / 100)
        html_content += f'''
            <div class="section">
                <div class="section-title">Average Pairwise Percent Agreement (平均配对百分比一致)</div>
                <div class="section-content">
                    <table>
                        <tr>
                            <th>平均值 / Average</th>
                            <td class="value-cell" style="color: {pa_color}">{pa_value:.3f}%</td>
                        </tr>
                    </table>
'''
        # 配对详情
        pairwise_details = percent_agreement.get('pairwise_details', {})
        if pairwise_details:
            html_content += '''
                    <div class="pairwise-table">
                        <h4>配对详情 / Pairwise Details</h4>
                        <div class="pairwise-grid">
'''
            for pair_name, pair_value in pairwise_details.items():
                html_content += f'''
                            <div class="pairwise-item">
                                <div class="pair-name">{pair_name}</div>
                                <div class="pair-value">{pair_value:.3f}%</div>
                            </div>
'''
            html_content += '''
                        </div>
        </div>
'''
        html_content += '''
                </div>
        </div>
'''
    
    # Fleiss' Kappa
    if fleiss_kappa.get('calculated'):
        fk_value = fleiss_kappa.get('value', 0)
        fk_color = get_interpretation_color(fk_value)
        fk_observed = fleiss_kappa.get('observed_agreement', 0)
        fk_expected = fleiss_kappa.get('expected_agreement', 0)
        html_content += f'''
            <div class="section">
                <div class="section-title">Fleiss' Kappa</div>
                <div class="section-content">
        <table>
            <tr>
                            <th>Fleiss' Kappa</th>
                            <th>观察一致性 / Observed</th>
                            <th>期望一致性 / Expected</th>
                        </tr>
                        <tr>
                            <td class="value-cell" style="color: {fk_color}">{fk_value:.4f}</td>
                            <td>{fk_observed:.4f}</td>
                            <td>{fk_expected:.4f}</td>
            </tr>
                    </table>
                </div>
            </div>
'''
    
    # Average Pairwise Cohen's Kappa
    if cohens_kappa.get('calculated'):
        ck_value = cohens_kappa.get('value', 0)
        ck_color = get_interpretation_color(ck_value)
        html_content += f'''
            <div class="section">
                <div class="section-title">Average Pairwise Cohen's Kappa (平均配对Cohen's Kappa)</div>
                <div class="section-content">
                    <table>
            <tr>
                            <th>平均值 / Average</th>
                            <td class="value-cell" style="color: {ck_color}">{ck_value:.4f}</td>
            </tr>
                    </table>
'''
        # 配对详情
        ck_pairwise = cohens_kappa.get('pairwise_details', {})
        if ck_pairwise:
            html_content += '''
                    <div class="pairwise-table">
                        <h4>配对详情 / Pairwise Details</h4>
                        <div class="pairwise-grid">
'''
            for pair_name, pair_value in ck_pairwise.items():
                pair_color = get_interpretation_color(pair_value)
                html_content += f'''
                            <div class="pairwise-item">
                                <div class="pair-name">{pair_name}</div>
                                <div class="pair-value" style="color: {pair_color}">{pair_value:.4f}</div>
                            </div>
'''
            html_content += '''
                        </div>
                    </div>
'''
        html_content += '''
                </div>
            </div>
'''

    # Krippendorff's Alpha
    if krippendorff_alpha.get('calculated'):
        ka_value = krippendorff_alpha.get('value', 0)
        ka_color = get_interpretation_color(ka_value)
        ka_level = krippendorff_alpha.get('level_of_measurement', 'nominal')
        ka_n_decisions = krippendorff_alpha.get('n_decisions', 'N/A')
        ka_sigma_o_cc = krippendorff_alpha.get('sigma_c_o_cc', 0)
        ka_sigma_nc = krippendorff_alpha.get('sigma_c_nc_nc_minus_1', 0)
        
        # 计算 Do 和 De
        # Alpha = 1 - Do/De
        # 如果 alpha 和 sigma 值有效，可以反推 Do 和 De
        if ka_sigma_nc > 0 and ka_value is not None:
            # Do/De = 1 - alpha
            do_de_ratio = 1 - ka_value
        else:
            do_de_ratio = None
        
        html_content += f'''
            <div class="section">
                <div class="section-title">Krippendorff's Alpha ({ka_level})</div>
                <div class="section-content">
                    <table>
                        <tr>
                            <th>Krippendorff's Alpha</th>
                            <th>测量层次 / Level</th>
                            <th>决策数 / N Decisions</th>
                        </tr>
                        <tr>
                            <td class="value-cell" style="color: {ka_color}">{ka_value:.4f}</td>
                            <td>{ka_level}</td>
                            <td>{ka_n_decisions}</td>
                        </tr>
                    </table>
                    <table style="margin-top: 10px;">
                        <tr>
                            <th>Coincidence Matrix 统计</th>
                            <th>数值</th>
                            <th>说明</th>
                        </tr>
                        <tr>
                            <td>&Sigma;<sub>c</sub> o<sub>cc</sub></td>
                            <td>{ka_sigma_o_cc:.6f}</td>
                            <td>观察一致性</td>
                        </tr>
                        <tr>
                            <td>&Sigma;<sub>c</sub> n<sub>c</sub>(n<sub>c</sub> - 1)</td>
                            <td>{ka_sigma_nc:.6f}</td>
                            <td>期望一致性</td>
            </tr>
                    </table>
                </div>
            </div>
'''
    
    # Recall/Precision (召回率/精确率)
    if precision_recall.get('calculated'):
        pr_recall = precision_recall.get('recall', 0)
        pr_precision = precision_recall.get('precision', 0)
        pr_f1 = precision_recall.get('f1_score', 0)
        pr_interpretation = precision_recall.get('interpretation', '')
        
        # 解释键映射
        interpretation_map = {
            'interpretation_excellent': '优秀 / Excellent',
            'interpretation_good': '良好 / Good',
            'interpretation_fair': '中等偏上 / Fair',
            'interpretation_moderate': '中等 / Moderate',
            'interpretation_poor': '中等偏下 / Poor',
            'interpretation_very_poor': '较差 / Very Poor'
        }
        pr_interpretation_text = interpretation_map.get(pr_interpretation, pr_interpretation)
        
        html_content += f'''
            <div class="section">
                <div class="section-title">召回率/精确率 (Recall/Precision)</div>
                <div class="section-content">
                    <p style="color: #666; font-size: 0.9em; margin: 10px 0 20px 0; padding-left: 20px; line-height: 1.6;">
                        基于标准答案（Gold Standard）计算的准确性指标
                    </p>
                    <table>
                        <tr>
                            <th>平均召回率 / Avg. Recall</th>
                            <th>平均精确率 / Avg. Precision</th>
                            <th>平均F1分数 / Avg. F1</th>
                            <th>解释 / Interpretation</th>
                        </tr>
                        <tr>
                            <td class="value-cell" style="color: {get_interpretation_color(pr_recall)}">{pr_recall * 100:.2f}%</td>
                            <td class="value-cell" style="color: {get_interpretation_color(pr_precision)}">{pr_precision * 100:.2f}%</td>
                            <td class="value-cell" style="color: {get_interpretation_color(pr_f1)}">{pr_f1:.4f}</td>
                            <td>{pr_interpretation_text}</td>
                        </tr>
                    </table>
'''
        
        # 按编码者分类的指标
        coder_details = precision_recall.get('coder_details', {})
        if coder_details:
            html_content += '''
                    <div class="pairwise-table" style="margin-top: 15px;">
                        <h4>按编码者分类 / By Coder</h4>
                        <table>
                            <tr>
                                <th>编码者 / Coder</th>
                                <th>召回率 / Recall</th>
                                <th>精确率 / Precision</th>
                                <th>F1分数 / F1</th>
                            </tr>
'''
            for coder_id, metrics in coder_details.items():
                c_recall = metrics.get('recall', 0) if isinstance(metrics, dict) else 0
                c_precision = metrics.get('precision', 0) if isinstance(metrics, dict) else 0
                c_f1 = metrics.get('f1_score', 0) if isinstance(metrics, dict) else 0
                html_content += f'''
                            <tr>
                                <td>{coder_id}</td>
                                <td style="color: {get_interpretation_color(c_recall)}">{c_recall * 100:.2f}%</td>
                                <td style="color: {get_interpretation_color(c_precision)}">{c_precision * 100:.2f}%</td>
                                <td style="color: {get_interpretation_color(c_f1)}">{c_f1:.4f}</td>
                            </tr>
'''
            html_content += '''
                        </table>
                    </div>
'''
        
        # 按标签分类的指标
        by_label = precision_recall.get('by_label', {})
        if by_label:
            html_content += '''
                    <div class="pairwise-table" style="margin-top: 15px;">
                        <h4>按标签分类 / By Label</h4>
                        <table>
                            <tr>
                                <th>标签 / Label</th>
                                <th>召回率 / Recall</th>
                                <th>精确率 / Precision</th>
                                <th>F1分数 / F1</th>
                            </tr>
'''
            for label, metrics in by_label.items():
                l_recall = metrics.get('recall', 0) if isinstance(metrics, dict) else 0
                l_precision = metrics.get('precision', 0) if isinstance(metrics, dict) else 0
                l_f1 = metrics.get('f1_score', 0) if isinstance(metrics, dict) else 0
                html_content += f'''
                            <tr>
                                <td>{label}</td>
                                <td style="color: {get_interpretation_color(l_recall)}">{l_recall * 100:.2f}%</td>
                                <td style="color: {get_interpretation_color(l_precision)}">{l_precision * 100:.2f}%</td>
                                <td style="color: {get_interpretation_color(l_f1)}">{l_f1:.4f}</td>
                            </tr>
'''
            html_content += '''
                        </table>
                    </div>
'''
        
        html_content += '''
                </div>
            </div>
'''
    
    # 解释说明
    html_content += '''
            <div class="interpretation-box">
                <h3>数值解释标准 / Interpretation Guidelines</h3>
                <div class="interpretation-grid">
                    <div class="interpretation-item">
                        <div class="color-dot" style="background: #27ae60"></div>
                        <span class="range">0.8 - 1.0</span>
                        <span class="desc">几乎完美 / Almost Perfect</span>
                    </div>
                    <div class="interpretation-item">
                        <div class="color-dot" style="background: #2ecc71"></div>
                        <span class="range">0.6 - 0.8</span>
                        <span class="desc">实质性 / Substantial</span>
                    </div>
                    <div class="interpretation-item">
                        <div class="color-dot" style="background: #f1c40f"></div>
                        <span class="range">0.4 - 0.6</span>
                        <span class="desc">中等 / Moderate</span>
                    </div>
                    <div class="interpretation-item">
                        <div class="color-dot" style="background: #e67e22"></div>
                        <span class="range">0.2 - 0.4</span>
                        <span class="desc">一般 / Fair</span>
                    </div>
                    <div class="interpretation-item">
                        <div class="color-dot" style="background: #e74c3c"></div>
                        <span class="range">0.0 - 0.2</span>
                        <span class="desc">轻微 / Slight</span>
                    </div>
                    <div class="interpretation-item">
                        <div class="color-dot" style="background: #c0392b"></div>
                        <span class="range">&lt; 0.0</span>
                        <span class="desc">差于偶然 / Poor</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>本报告由 <strong>Meta-Lingo</strong> 语料库研究软件生成</p>
'''
    html_content += f'''
            <p>生成时间: {current_time}</p>
        </div>
    </div>
</body>
</html>
'''
    
    return html_content


def generate_csv_report(results: Dict[str, Any]) -> str:
    """
    生成 CSV 格式的报告
    
    Args:
        results: 计算结果字典
        
    Returns:
        CSV 字符串
    """
    # 解释键映射
    interpretation_map = {
        'interpretation_excellent': '优秀 / Excellent',
        'interpretation_good': '良好 / Good',
        'interpretation_fair': '中等偏上 / Fair',
        'interpretation_moderate': '中等 / Moderate',
        'interpretation_poor': '中等偏下 / Poor',
        'interpretation_very_poor': '较差 / Very Poor'
    }
    
    lines = ["系数名称 / Coefficient,数值 / Value,解释 / Interpretation"]
    
    for coeff_name, coeff_data in results.items():
        # 跳过 precision_recall，单独处理
        if coeff_name == 'precision_recall':
            continue
            
        if coeff_data.get('calculated', False):
            value = coeff_data.get('value', 0)
            value_str = f"{float(value):.4f}" if isinstance(value, (int, float)) else str(value)
            display_name = coeff_data.get('display_name', coeff_name)
            interpretation = coeff_data.get('interpretation', '')
            interpretation = interpretation_map.get(interpretation, interpretation)
            lines.append(f'"{display_name}",{value_str},"{interpretation}"')
            
            # 添加详细信息
            # Percent Agreement 和 Cohen's Kappa 的配对详情
            pairwise_details = coeff_data.get('pairwise_details', {})
            if pairwise_details:
                lines.append("配对详情 / Pairwise Details")
                lines.append("编码者对 / Coder Pair,数值 / Value")
                for pair_name, pair_value in pairwise_details.items():
                    lines.append(f'"{pair_name}",{pair_value:.4f}')
                lines.append("")
            
            # Fleiss' Kappa 的观察一致性和期望一致性
            if coeff_name == 'fleiss_kappa':
                observed = coeff_data.get('observed_agreement', 0)
                expected = coeff_data.get('expected_agreement', 0)
                lines.append(f'"观察一致性 / Observed Agreement",{observed:.4f},')
                lines.append(f'"期望一致性 / Expected Agreement",{expected:.4f},')
                lines.append("")
            
            # Krippendorff's Alpha 的详细信息
            if coeff_name == 'krippendorff_alpha':
                level = coeff_data.get('level_of_measurement', 'N/A')
                n_decisions = coeff_data.get('n_decisions', 'N/A')
                sigma_o_cc = coeff_data.get('sigma_c_o_cc', 0)
                sigma_nc = coeff_data.get('sigma_c_nc_nc_minus_1', 0)
                lines.append(f'"测量层次 / Level of Measurement",{level},')
                lines.append(f'"决策数 / N Decisions",{n_decisions},')
                lines.append(f'"观察一致性 / Σc occ",{sigma_o_cc:.6f},')
                lines.append(f'"期望一致性 / Σc nc(nc-1)",{sigma_nc:.6f},')
                lines.append("")
        else:
            display_name = coeff_data.get('display_name', coeff_name)
            error = coeff_data.get('error', '计算失败')
            lines.append(f'"{display_name}",-,"{error}"')
    
    # 处理 precision_recall
    precision_recall = results.get('precision_recall', {})
    if precision_recall.get('calculated'):
        lines.append("")
        lines.append("召回率/精确率 (Recall/Precision)")
        lines.append("指标 / Metric,数值 / Value,解释 / Interpretation")
        
        pr_recall = precision_recall.get('recall', 0)
        pr_precision = precision_recall.get('precision', 0)
        pr_f1 = precision_recall.get('f1_score', 0)
        pr_interpretation = precision_recall.get('interpretation', '')
        pr_interpretation_text = interpretation_map.get(pr_interpretation, pr_interpretation)
        
        lines.append(f'"平均召回率 / Avg. Recall",{pr_recall * 100:.2f}%,')
        lines.append(f'"平均精确率 / Avg. Precision",{pr_precision * 100:.2f}%,')
        lines.append(f'"平均F1分数 / Avg. F1",{pr_f1:.4f},"{pr_interpretation_text}"')
        
        # 按编码者分类
        coder_details = precision_recall.get('coder_details', {})
        if coder_details:
            lines.append("")
            lines.append("按编码者分类 / By Coder")
            lines.append("编码者 / Coder,召回率 / Recall,精确率 / Precision,F1分数 / F1")
            for coder_id, metrics in coder_details.items():
                if isinstance(metrics, dict):
                    c_recall = metrics.get('recall', 0)
                    c_precision = metrics.get('precision', 0)
                    c_f1 = metrics.get('f1_score', 0)
                    lines.append(f'"{coder_id}",{c_recall * 100:.2f}%,{c_precision * 100:.2f}%,{c_f1:.4f}')
        
        # 按标签分类
        by_label = precision_recall.get('by_label', {})
        if by_label:
            lines.append("")
            lines.append("按标签分类 / By Label")
            lines.append("标签 / Label,召回率 / Recall,精确率 / Precision,F1分数 / F1")
            for label, metrics in by_label.items():
                if isinstance(metrics, dict):
                    l_recall = metrics.get('recall', 0)
                    l_precision = metrics.get('precision', 0)
                    l_f1 = metrics.get('f1_score', 0)
                    lines.append(f'"{label}",{l_recall * 100:.2f}%,{l_precision * 100:.2f}%,{l_f1:.4f}')
    
    return "\n".join(lines)


def generate_json_report(
    results: Dict[str, Any],
    data_summary: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    生成 JSON 格式的报告
    
    Args:
        results: 计算结果字典
        data_summary: 数据摘要
        
    Returns:
        JSON 字典
    """
    import json
    
    report = {
        'generated_at': datetime.datetime.now().isoformat(),
        'summary': data_summary or {},
        'coefficients': {}
    }
    
    for coeff_name, coeff_data in results.items():
        report['coefficients'][coeff_name] = {
            'calculated': coeff_data.get('calculated', False),
            'display_name': coeff_data.get('display_name', coeff_name),
            'value': coeff_data.get('value'),
            'interpretation': coeff_data.get('interpretation'),
            'error': coeff_data.get('error')
        }
    
    return report
