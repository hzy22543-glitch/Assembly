import React, { useState } from 'react';
import './PaywallModal.css';

function PaywallModal({ isOpen, onClose, onSuccess }) {
  const [isPaying, setIsPaying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubscribe = () => {
    setIsPaying(true);
    // 模拟等待扫码支付
    setTimeout(() => {
      setIsSuccess(true);
      setTimeout(() => {
        onSuccess();
        setIsPaying(false);
        setIsSuccess(false);
      }, 1500);
    }, 2500);
  };

  return (
    <div className="paywall-overlay" onClick={onClose}>
      <div
        className="paywall-content"
        onClick={e => e.stopPropagation()}
        style={isPaying ? { maxWidth: '400px' } : {}}
      >
        <button className="paywall-close" onClick={onClose}>×</button>

        {isPaying ? (
          <div className="payment-flow">
            {isSuccess ? (
              <div className="payment-success">
                <div className="success-icon">✓</div>
                <h3>支付成功！</h3>
                <p>已激活 Pro 会员，本月 500,000 Token 额度已到账</p>
              </div>
            ) : (
              <div className="payment-qr">
                <h3>微信扫描二维码支付</h3>
                <p className="price-tag">¥ 9.90<span>/月</span></p>
                <div className="qr-skeleton">
                  <div className="qr-inner-scan"></div>
                </div>
                <p className="qr-hint">请使用微信扫一扫完成订阅</p>
              </div>
            )}
          </div>
        ) : (
          <div className="pricing-plans">
            <div className="pricing-header">
              <h2>您的免费用量已耗尽</h2>
              <p>升级 Pro，释放 AI 极致潜能，提升 10 倍学习效率</p>
            </div>

            <div className="plans-container">
              {/* 免费版 */}
              <div className="plan-card">
                <h3>基础版</h3>
                <div className="price">¥0<span>/月</span></div>
                <ul className="features">
                  <li>每日 2 次基础 AI 诊断</li>
                  <li>支持 16位 DOS 汇编</li>
                  <li>标准社区支持</li>
                </ul>
                <button className="btn-plan disabled">当前版本</button>
              </div>

              {/* PRO 版 */}
              <div className="plan-card pro">
                <div className="pro-badge">最受欢迎</div>
                <h3>Pro 会员</h3>
                <div className="price">¥9.9<span>/月</span></div>
                <ul className="features">
                  <li><b>每月 500,000 Token</b> 额度</li>
                  <li>AI 智能深度剖析 · 执行流程图生成</li>
                  <li>完整语义教学报告</li>
                  <li>支持 64位 GCC 底层分析</li>
                  <li>云端工程存档 · 优先队列响应</li>
                  <li>API 熔断保护，额度用完次月自动续期</li>
                </ul>
                <button className="btn-plan highlight" onClick={handleSubscribe}>立即升级 Pro</button>
              </div>

              {/* 团队版 */}
              <div className="plan-card">
                <h3>团队教育版</h3>
                <div className="price">¥99<span>/月</span></div>
                <ul className="features">
                  <li>包含 Pro 所有特权</li>
                  <li><b>每月 5,000,000 Token</b> 共享池</li>
                  <li>50 人班级独立子账号</li>
                  <li>教师可视化学情面板</li>
                  <li>批量检测代码相似度</li>
                </ul>
                <button className="btn-plan outline">联系销售</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PaywallModal;
